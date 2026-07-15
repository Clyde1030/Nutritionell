terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.40"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # After your first apply, move state to S3 so it's shared + locked.
  # Create the bucket + DynamoDB lock table once, then uncomment:
  #
  # backend "s3" {
  #   bucket         = "nutritionell-tfstate"
  #   key            = "infra/terraform.tfstate"
  #   region         = "us-east-1"
  #   dynamodb_table = "nutritionell-tflock"
  #   encrypt        = true
  # }
}

provider "aws" {
  region  = var.aws_region
  profile = var.aws_profile

  default_tags {
    tags = {
      Project   = "nutritionell"
      ManagedBy = "terraform"
      Env       = var.environment
    }
  }
}

# --- Removed 2026-07-14: was only needed for CloudFront's ACM cert, which must
# live in us-east-1 regardless of where the distribution's origin is. Dropped
# along with edge_domain.tf's CloudFront distribution (see api_domain.tf) --
# the ALB's own ACM cert just uses the default (var.aws_region) provider.
#
# provider "aws" {
#   alias   = "us_east_1"
#   region  = "us-east-1"
#   profile = var.aws_profile
#
#   default_tags {
#     tags = {
#       Project   = "nutritionell"
#       ManagedBy = "terraform"
#       Env       = var.environment
#     }
#   }
# }

# Optional DNS account provider for cross-account Route53 updates.
provider "aws" {
  alias   = "dns"
  region  = var.aws_region
  profile = var.dns_aws_profile == null ? var.aws_profile : var.dns_aws_profile

  dynamic "assume_role" {
    for_each = var.dns_assume_role_arn == null ? [] : [var.dns_assume_role_arn]

    content {
      role_arn     = assume_role.value
      session_name = var.dns_assume_role_session_name
      external_id  = var.dns_assume_role_external_id
    }
  }

  default_tags {
    tags = {
      Project   = "nutritionell"
      ManagedBy = "terraform"
      Env       = var.environment
    }
  }
}
