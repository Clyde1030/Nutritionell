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
  region = var.aws_region

  default_tags {
    tags = {
      Project   = "nutritionell"
      ManagedBy = "terraform"
      Env       = var.environment
    }
  }
}
