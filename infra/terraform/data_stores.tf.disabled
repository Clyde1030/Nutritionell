# ---------- ECR ----------
resource "aws_ecr_repository" "backend" {
  name                 = "${var.name_prefix}-backend"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

# Keep only the last 10 images
resource "aws_ecr_lifecycle_policy" "backend" {
  repository = aws_ecr_repository.backend.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 10 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 10
      }
      action = { type = "expire" }
    }]
  })
}

# ---------- RDS Postgres (pgvector-capable) ----------
resource "random_password" "db" {
  length  = 24
  special = false # keep it URL-safe for the asyncpg DSN
}

resource "aws_db_subnet_group" "this" {
  name       = "${var.name_prefix}-db-subnets"
  subnet_ids = module.vpc.private_subnets
}

resource "aws_db_instance" "postgres" {
  identifier     = "${var.name_prefix}-postgres"
  engine         = "postgres"
  engine_version = "16"
  instance_class = var.db_instance_class

  allocated_storage     = var.db_allocated_storage
  max_allocated_storage = 100
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name  = var.db_name
  username = var.db_username
  password = random_password.db.result

  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false

  multi_az                  = false # set true for production HA
  backup_retention_period   = 7
  deletion_protection       = false
  skip_final_snapshot       = true
  final_snapshot_identifier = "${var.name_prefix}-postgres-final"

  apply_immediately = true
}
# NOTE: after first apply, connect once and run:  CREATE EXTENSION IF NOT EXISTS vector;
# pgvector ships with RDS Postgres 16 — it just needs enabling per-database.

# ---------- Secrets Manager ----------
# Full asyncpg DSN, built from the RDS endpoint after creation.
resource "aws_secretsmanager_secret" "database_url" {
  name                    = "${var.name_prefix}/database-url"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "database_url" {
  secret_id = aws_secretsmanager_secret.database_url.id
  secret_string = format(
    "postgresql+asyncpg://%s:%s@%s/%s",
    var.db_username,
    random_password.db.result,
    aws_db_instance.postgres.endpoint, # host:port
    var.db_name,
  )
}

resource "aws_secretsmanager_secret" "gemini_api_key" {
  name                    = "${var.name_prefix}/gemini-api-key"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "gemini_api_key" {
  secret_id     = aws_secretsmanager_secret.gemini_api_key.id
  secret_string = var.gemini_api_key
}
