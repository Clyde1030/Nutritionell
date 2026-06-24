# =====================================================================
# Grant the EXISTING SageMaker execution role access to:
#   - S3 (working + artifacts buckets)
#   - Athena (run queries)
#   - Glue Data Catalog (read/define table schemas)
# =====================================================================

data "aws_iam_policy_document" "sagemaker_data_access" {

  statement {
    sid     = "S3ListBuckets"
    effect  = "Allow"
    actions = ["s3:ListBucket", "s3:GetBucketLocation"]
    resources = [
      aws_s3_bucket.data.arn,
      aws_s3_bucket.artifacts.arn,
    ]
  }

  statement {
    sid    = "S3Objects"
    effect = "Allow"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
    ]
    resources = [
      "${aws_s3_bucket.data.arn}/*",
      "${aws_s3_bucket.artifacts.arn}/*",
    ]
  }

  statement {
    sid    = "AthenaQuery"
    effect = "Allow"
    actions = [
      "athena:StartQueryExecution",
      "athena:StopQueryExecution",
      "athena:GetQueryExecution",
      "athena:GetQueryResults",
      "athena:GetWorkGroup",
      "athena:ListWorkGroups",
      "athena:GetDataCatalog",
      "athena:ListDataCatalogs",
      "athena:ListDatabases",
      "athena:ListTableMetadata",
      "athena:StartSession",
    ]
    resources = ["*"]
  }

  statement {
    sid    = "GlueCatalog"
    effect = "Allow"
    actions = [
      "glue:GetDatabase",
      "glue:GetDatabases",
      "glue:GetTable",
      "glue:GetTables",
      "glue:GetPartition",
      "glue:GetPartitions",
      "glue:BatchGetPartition",
      "glue:CreateTable",
      "glue:UpdateTable",
      "glue:CreateDatabase",
      "glue:BatchCreatePartition",
      "glue:GetSchema",
      "glue:ListSchemas",
      "glue:GetConnection",
      "glue:GetConnections",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "sagemaker_data_access" {
  name   = "nutritionell-data-access"
  role   = data.aws_iam_role.existing_sagemaker_role.name
  policy = data.aws_iam_policy_document.sagemaker_data_access.json
}
