# output "alb_url" {
#   description = "Public API endpoint (point your web + mobile apps here)"
#   value       = "http://${aws_lb.this.dns_name}"
# }

output "ecr_repository_url" {
  description = "Push your backend image here"
  value       = aws_ecr_repository.backend.repository_url
}

output "rds_endpoint" {
  description = "Postgres host:port (private)"
  value       = aws_db_instance.postgres.endpoint
}

output "images_bucket" {
  value = aws_s3_bucket.images.bucket
}
