data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# # Existing SageMaker execution role — referenced by the domain
# # (sagemaker.tf) and granted data access (iam-data-access.tf).
# data "aws_iam_role" "existing_sagemaker_role" {
#   name = "AmazonSageMaker-ExecutionRole-20260604T131261"
# }
