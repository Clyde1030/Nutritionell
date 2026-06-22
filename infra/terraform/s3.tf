# =====================================================================
# S3 buckets for the Nutritionell project
# - images bucket  : uploaded shelf images (used by the app)
# - working bucket : all project data that Athena will query
# - artifacts bucket: Athena query results + TF state + SageMaker outputs
#
# SageMaker -> S3 ACCESS is NOT granted here. The SageMaker execution role
# is granted S3 (+ Athena + Glue) access via an identity-based policy in
# iam-data-access.tf.
# =====================================================================

locals {
  account_id    = data.aws_caller_identity.current.account_id
  data_bucket   = "${var.data_bucket_name}-${local.account_id}"
  artifacts_bkt = "${var.artifacts_bucket_name}-${local.account_id}"

  data_prefixes = [
    "raw/open-food-facts/images/",
    "raw/open-food-facts/metadata/",
    "raw/usda/fndds/",
    "raw/usda/branded-foods/",
    "raw/sku110k/",
    "raw/allergen-tags/",
    "external/",
    "processed/training/",
    "processed/validation/",
    "processed/test/",
  ]

  artifacts_prefixes = [
    "athena-results/",
    "terraform-state/",
    "model-artifacts/",
    "training-outputs/",
    "processing-outputs/",
    "endpoint-outputs/",
  ]
}

# ---------------------------------------------------------------------
# Uploaded shelf images bucket (used by the app via ECS task role)
# ---------------------------------------------------------------------
resource "aws_s3_bucket" "images" {
  bucket = "${var.name_prefix}-images-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket_public_access_block" "images" {
  bucket                  = aws_s3_bucket.images.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "images" {
  bucket = aws_s3_bucket.images.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# ---------------------------------------------------------------------
# Working data bucket
# ---------------------------------------------------------------------
resource "aws_s3_bucket" "data" {
  bucket = local.data_bucket

  tags = {
    Name = local.data_bucket
  }
}

resource "aws_s3_bucket_versioning" "data" {
  bucket = aws_s3_bucket.data.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "data" {
  bucket = aws_s3_bucket.data.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "data" {
  bucket                  = aws_s3_bucket.data.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "data" {
  bucket = aws_s3_bucket.data.id

  depends_on = [aws_s3_bucket_versioning.data]

  rule {
    id     = "data_lifecycle"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 30
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

resource "aws_s3_object" "data_tree" {
  for_each = toset(local.data_prefixes)
  bucket   = aws_s3_bucket.data.id
  key      = each.value
  content  = ""
}

# ---------------------------------------------------------------------
# Artifacts bucket (Athena results + TF state + SageMaker outputs)
# ---------------------------------------------------------------------
resource "aws_s3_bucket" "artifacts" {
  bucket = local.artifacts_bkt

  tags = {
    Name = local.artifacts_bkt
  }
}

resource "aws_s3_bucket_versioning" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "artifacts" {
  bucket                  = aws_s3_bucket.artifacts.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  depends_on = [aws_s3_bucket_versioning.artifacts]

  rule {
    id     = "athena_results_cleanup"
    status = "Enabled"

    filter {
      prefix = "athena-results/"
    }

    expiration {
      days = 30
    }

    noncurrent_version_expiration {
      noncurrent_days = 7
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  rule {
    id     = "terraform_state_versions"
    status = "Enabled"

    filter {
      prefix = "terraform-state/"
    }

    noncurrent_version_expiration {
      noncurrent_days = 90
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

resource "aws_s3_object" "artifacts_tree" {
  for_each = toset(local.artifacts_prefixes)
  bucket   = aws_s3_bucket.artifacts.id
  key      = each.value
  content  = ""
}
