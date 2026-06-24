# ---------- Application Load Balancer ----------
resource "aws_lb" "this" {
  name               = "${var.name_prefix}-alb"
  load_balancer_type = "application" # HTTP/HTTPS aware (vs "network" for raw TCP)
  security_groups    = [aws_security_group.alb.id] # firewall defined in network.tf
  subnets            = module.vpc.public_subnets # lives in public subnets — faces the internet
}

resource "aws_lb_target_group" "app" {
  name        = "${var.name_prefix}-tg"
  port        = 8000
  protocol    = "HTTP"
  vpc_id      = module.vpc.vpc_id
  target_type = "ip" # required for Fargate — containers don't have fixed EC2 instance IDs

  health_check {
    path                = "/health"   # ALB polls this endpoint to know if the container is alive
    matcher             = "200"       # must return HTTP 200 to be considered healthy
    interval            = 30          # check every 30s
    timeout             = 5           # fail if no response within 5s
    healthy_threshold   = 2           # 2 consecutive passes = healthy
    unhealthy_threshold = 3           # 3 consecutive fails = remove from rotation
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.this.arn
  port              = 80
  protocol          = "HTTP"

  # forwards all port-80 traffic to the target group (your app)
  # comment says: swap to HTTPS redirect once you add ACM + Route 53

  # Once you add ACM + Route 53, switch this to redirect 80 -> 443
  # and create an HTTPS listener on 443 with your certificate_arn.
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app.arn
  }
}

# ---------- ECS cluster + Fargate service ----------
resource "aws_ecs_cluster" "this" {
  name = "${var.name_prefix}-cluster"
  setting {
    name  = "containerInsights"
    value = "enabled" # turns on CloudWatch metrics for CPU/memory/task counts
  }
}

resource "aws_cloudwatch_log_group" "app" {
  name              = "/ecs/${var.name_prefix}-backend"
  retention_in_days = 14 # auto-deletes logs older than 14 days to control cost
}

# Execution role: lets ECS pull from ECR, write logs, read secrets at launch
resource "aws_iam_role" "execution" {
  name = "${var.name_prefix}-ecs-execution"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "execution_managed" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "execution_secrets" {
  name = "read-secrets"
  role = aws_iam_role.execution.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue"]
      Resource = [
        aws_secretsmanager_secret.database_url.arn,
        aws_secretsmanager_secret.gemini_api_key.arn,
      ]
    }]
  })
}

# Task role: permissions the running app itself needs (e.g. S3 for images)
resource "aws_iam_role" "task" {
  name = "${var.name_prefix}-ecs-task"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "task_s3" {
  name = "images-bucket-access"
  role = aws_iam_role.task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
      Resource = ["${aws_s3_bucket.images.arn}/*"]
    }]
  })
}

resource "aws_ecs_task_definition" "app" {
  family                   = "${var.name_prefix}-backend"
  requires_compatibilities = ["FARGATE"]      # serverless containers, no EC2 to manage
  network_mode             = "awsvpc"         # each task gets its own ENI and private IP
  cpu                      = var.task_cpu
  memory                   = var.task_memory
  execution_role_arn       = aws_iam_role.execution.arn  # startup permissions
  task_role_arn            = aws_iam_role.task.arn       # runtime permissions

  container_definitions = jsonencode([{
    name      = "backend"
    image     = "${aws_ecr_repository.backend.repository_url}:${var.container_image_tag}"
    essential = true

    portMappings = [{ containerPort = 8000, protocol = "tcp" }]

    environment = [
      { name = "API_HOST", value = "0.0.0.0" },
      { name = "API_PORT", value = "8000" },
      { name = "S3_BUCKET", value = aws_s3_bucket.images.bucket },
    ]

    secrets = [
      { name = "DATABASE_URL", valueFrom = aws_secretsmanager_secret.database_url.arn },
      { name = "GEMINI_API_KEY", valueFrom = aws_secretsmanager_secret.gemini_api_key.arn },
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.app.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "backend"
      }
    }
  }])
}

resource "aws_ecs_service" "app" {
  name            = "${var.name_prefix}-backend"
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = module.vpc.public_subnets
    security_groups  = [aws_security_group.app.id]
    assign_public_ip = true # required when NAT Gateway is disabled
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.app.arn
    container_name   = "backend"
    container_port   = 8000
  }

  depends_on = [aws_lb_listener.http]
}
