# =====================================================================
# One-time bootstrap: dedicated IAM role for Terraform applies.
#
# Enable this file only while authenticated as an identity that can create
# IAM roles and policies in account 586199468366. After the role exists,
# switch normal Terraform runs to that role via:
#   - var.aws_profile
#   - var.terraform_assume_role_arn
#
# The trust policy below uses your current caller identity as the bootstrap
# principal automatically. Run `aws sts get-caller-identity` beforehand to
# confirm you are authenticated as the intended identity.
# =====================================================================

locals {
  terraform_deployer_role_name = "TerraformDeployer"
}

data "aws_iam_policy_document" "terraform_deployer_trust" {
  statement {
    sid     = "AllowBootstrapPrincipal"
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    # Allow these principals to assume the role
    principals {
      type = "AWS"
      identifiers = [
        "arn:aws:iam::586199468366:role/PriyankaBanerjeeRole",
        "arn:aws:iam::586199468366:user/PriyankaBanerjee",
        
      ]
    }

    dynamic "condition" {
      for_each = var.terraform_assume_role_external_id == null ? [] : [var.terraform_assume_role_external_id]

      content {
        test     = "StringEquals"
        variable = "sts:ExternalId"
        values   = [condition.value]
      }
    }
  }
}

data "aws_iam_policy_document" "terraform_deployer_permissions" {
  statement {
    sid    = "IamReadTerraformRole"
    effect = "Allow"
    actions = [
      "iam:*",
      # "iam:ListRolePolicies",
    ]
    resources = [
      "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/${local.terraform_deployer_role_name}",
    ]
  }

  statement {
    sid    = "S3BucketManagement"
    effect = "Allow"
    actions = [
      "s3:*", /*
      "s3:CreateBucket",
      "s3:DeleteBucket",
      "s3:GetBucketAcl",
      "s3:GetBucketLocation",
      "s3:GetBucketPolicy",
      "s3:GetBucketPublicAccessBlock",
      "s3:GetBucketTagging",
      "s3:GetBucketVersioning",
      "s3:GetEncryptionConfiguration",
      "s3:GetLifecycleConfiguration",
      "s3:GetBucketCORS",
      "s3:GetBucketWebsite",
      "s3:ListAllMyBuckets",
      "s3:ListBucket",
      "s3:PutBucketPublicAccessBlock",
      "s3:PutBucketTagging",
      "s3:PutBucketVersioning",
      "s3:PutEncryptionConfiguration",
      "s3:PutLifecycleConfiguration",
      "s3:DeleteBucketPolicy",
      "s3:DeleteBucketPublicAccessBlock",
      "s3:DeleteBucketTagging",
      "s3:DeleteBucketWebsite",
      "s3:PutBucketOwnershipControls",
      "s3:GetBucketOwnershipControls",
      "s3:DeleteBucketOwnershipControls", */
    ]
    resources = [
      "arn:aws:s3:::${var.name_prefix}-images-${data.aws_caller_identity.current.account_id}",
      "arn:aws:s3:::${var.data_bucket_name}-${data.aws_caller_identity.current.account_id}",
      "arn:aws:s3:::${var.artifacts_bucket_name}-${data.aws_caller_identity.current.account_id}",
    ]
  }

  statement {
    sid    = "S3ObjectManagement"
    effect = "Allow"
    actions = [
      "s3:DeleteObject",
      "s3:GetObject",
      "s3:PutObject",
      "s3:GetObjectTagging"
    ]
    resources = [
      "arn:aws:s3:::${var.name_prefix}-images-${data.aws_caller_identity.current.account_id}/*",
      "arn:aws:s3:::${var.data_bucket_name}-${data.aws_caller_identity.current.account_id}/*",
      "arn:aws:s3:::${var.artifacts_bucket_name}-${data.aws_caller_identity.current.account_id}/*",
    ]
  }
}

resource "aws_iam_role" "terraform_deployer" {
  name               = local.terraform_deployer_role_name
  assume_role_policy = data.aws_iam_policy_document.terraform_deployer_trust.json

  tags = {
    Name = local.terraform_deployer_role_name
  }
}

resource "aws_iam_role_policy" "terraform_deployer" {
  name   = "${local.terraform_deployer_role_name}-s3"
  role   = aws_iam_role.terraform_deployer.id
  policy = data.aws_iam_policy_document.terraform_deployer_permissions.json
}

output "terraform_deployer_role_arn" {
  value       = aws_iam_role.terraform_deployer.arn
  description = "ARN of the Terraform deployment role"
}