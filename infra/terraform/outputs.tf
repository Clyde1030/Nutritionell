# ---------- Application ----------
output "alb_url" {
  description = "Public API endpoint (point your web + mobile apps here)"
  value       = "http://${aws_lb.this.dns_name}"
}

output "ecr_repository_url" {
  description = "Push your backend image here"
  value       = aws_ecr_repository.backend.repository_url
}

output "rds_endpoint" {
  description = "Postgres host:port (private)"
  value       = aws_db_instance.postgres.endpoint
}

# ---------- S3 ----------
output "images_bucket" {
  value = aws_s3_bucket.images.bucket
}

output "data_bucket_name" {
  description = "Working data bucket"
  value       = aws_s3_bucket.data.bucket
}

output "data_bucket_arn" {
  description = "Working data bucket ARN"
  value       = aws_s3_bucket.data.arn
}

output "artifacts_bucket_name" {
  description = "Artifacts / Athena-results / state bucket"
  value       = aws_s3_bucket.artifacts.bucket
}

output "artifacts_bucket_arn" {
  description = "Artifacts bucket ARN"
  value       = aws_s3_bucket.artifacts.arn
}

# ---------- SageMaker ----------
output "domain_id" {
  description = "The ID of the SageMaker domain"
  value       = aws_sagemaker_domain.main.id
}

output "domain_arn" {
  description = "The ARN of the SageMaker domain"
  value       = aws_sagemaker_domain.main.arn
}

output "domain_url" {
  description = "The domain's URL"
  value       = aws_sagemaker_domain.main.url
}

output "user_profile_arns" {
  description = "Map of user profile name -> ARN"
  value       = { for k, u in aws_sagemaker_user_profile.users : k => u.arn }
}

output "space_arns" {
  description = "Map of space name -> ARN"
  value       = { for s in aws_sagemaker_space.jupyter_spaces : s.space_name => s.arn }
}

output "execution_role_arn" {
  description = "The ARN of the SageMaker execution role"
  value       = data.aws_iam_role.existing_sagemaker_role.arn
}

output "account_id" {
  description = "Current AWS Account ID"
  value       = data.aws_caller_identity.current.account_id
}

output "region" {
  description = "Current AWS Region"
  value       = data.aws_region.current.name
}

output "custom_domain" {
  description = "Configured custom domain name"
  value       = try(var.custom_domain_name, null)
}

output "acm_certificate_arn" {
  description = "ACM certificate ARN for custom domain"
  value       = try(aws_acm_certificate.site[0].arn, null)
}

output "cloudfront_domain_name" {
  description = "CloudFront distribution domain"
  value       = try(aws_cloudfront_distribution.site[0].domain_name, null)
}

# ---------- Glue / Athena ----------
output "glue_database" {
  value       = aws_glue_catalog_database.main.name
  description = "Glue catalog database name"
}

output "athena_workgroup" {
  value       = aws_athena_workgroup.main.name
  description = "Athena workgroup name (pass to awswrangler)"
}
