# =====================================================================
# Glue Data Catalog database + Athena workgroup
# =====================================================================

resource "aws_glue_catalog_database" "main" {
  name        = var.glue_database_name
  description = "Nutritionell project tables over S3 CSV/Parquet"
}

resource "aws_athena_workgroup" "main" {
  name = var.athena_workgroup_name

  configuration {
    enforce_workgroup_configuration    = true
    publish_cloudwatch_metrics_enabled = true

    result_configuration {
      output_location = "s3://${aws_s3_bucket.artifacts.bucket}/athena-results/"
      encryption_configuration {
        encryption_option = "SSE_S3"
      }
    }
  }

  tags = {
    Project   = "nutritionell"
    ManagedBy = "terraform"
  }
}
