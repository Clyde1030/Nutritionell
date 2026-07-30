variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "aws_profile" {
  description = "Optional AWS CLI profile used by the default provider"
  type        = string
  default     = null
}

variable "enable_custom_domain" {
  description = "Create ACM/Route53/Amplify domain resources for api.<zone> and app.<zone>"
  type        = bool
  default     = false
}

variable "terraform_assume_role_external_id" {
  description = "Optional external ID for the Terraform assume role"
  type        = string
  default     = null
}

# --- Removed 2026-07-14: replaced by api_subdomain/app_subdomain below.
# CloudFront-in-front-of-ALB is gone (see api_domain.tf) in favor of an ALB HTTPS
# listener for the API, plus Amplify Hosting (amplify.tf) for web_new.
#
# variable "custom_domain_name" {
#   description = "Primary FQDN for the site (for example, nutritionell.com)"
#   type        = string
#   default     = null
# }
#
# variable "custom_domain_san_names" {
#   description = "Additional SAN names for ACM and CloudFront aliases"
#   type        = list(string)
#   default     = []
# }

variable "api_subdomain" {
  description = "Subdomain for the backend API (served via ALB + ACM)"
  type        = string
  default     = "api"
}

variable "app_subdomain" {
  description = "Subdomain for the web_new frontend (served via Amplify Hosting)"
  type        = string
  default     = "app"
}

variable "dns_zone_name" {
  description = "Route53 public hosted zone name that owns the domain"
  type        = string
  default     = "nutritionell.com"
}

variable "dns_aws_profile" {
  description = "Optional AWS profile for Route53 account access"
  type        = string
  default     = null
}

variable "dns_assume_role_arn" {
  description = "Optional cross-account role ARN to manage Route53 records"
  type        = string
  default     = null
}

variable "dns_assume_role_session_name" {
  description = "Session name for cross-account Route53 role assumption"
  type        = string
  default     = "nutritionell-dns-terraform"
}

variable "dns_assume_role_external_id" {
  description = "Optional external ID for Route53 cross-account role"
  type        = string
  default     = null
}

# --- Removed 2026-07-14: CloudFront-in-front-of-ALB dropped (see api_domain.tf
# comment for why -- the old distribution cached nothing, TTLs were all 0).
#
# variable "enable_cloudfront" {
#   description = "Create CloudFront distribution in front of the ALB"
#   type        = bool
#   default     = true
# }
#
# variable "cloudfront_price_class" {
#   description = "CloudFront price class"
#   type        = string
#   default     = "PriceClass_100"
# }

variable "environment" {
  type    = string
  default = "prod"
}

variable "name_prefix" {
  type    = string
  default = "nutritionell"
}

# --- Networking ---
variable "vpc_cidr" {
  type    = string
  default = "10.0.0.0/16"
}

# --- Database ---
variable "db_name" {
  type    = string
  default = "nutritionell_db"
}

variable "db_username" {
  type    = string
  default = "nutritionell"
}

variable "db_instance_class" {
  type    = string
  default = "db.t4g.micro" # cheap to start; bump for production load
}

variable "db_allocated_storage" {
  type    = number
  default = 20
}

# --- Application ---
variable "container_image_tag" {
  type    = string
  default = "latest"
}

variable "desired_count" {
  type    = number
  # default = 1
  default = 5 # scaled out for higher-concurrency scan testing
}

variable "task_cpu" {
  type    = number
  default = 512 # 0.5 vCPU
}

variable "task_memory" {
  type    = number
  default = 1024 # 1 GB
}

# --- LLM key ---
# Pass via TF_VAR_gemini_api_key env var or a tfvars file you DON'T commit.
variable "gemini_api_key" {
  type      = string
  sensitive = true
}

# --- S3 data buckets ---
variable "data_bucket_name" {
  description = "Working data bucket (account_id is appended for uniqueness)"
  type        = string
  default     = "nutritionell-data"
}

variable "artifacts_bucket_name" {
  description = "Artifacts/results/state bucket (account_id is appended for uniqueness)"
  type        = string
  default     = "nutritionell-artifacts"
}

# --- SageMaker ---
variable "domain_name" {
  description = "Name for the SageMaker domain"
  type        = string
  default     = "CapstoneTeam-Domain-tf"
}

variable "user_profile_names" {
  description = "One SageMaker user profile per team member"
  type        = list(string)
  default     = ["yusheng", "steven", "priyanka", "najmeh"]
}

variable "idle_timeout_in_minutes" {
  description = "Auto-stop JupyterLab apps after this many minutes of inactivity (AWS requires >= 60)"
  type        = number
  default     = 60

  validation {
    condition     = var.idle_timeout_in_minutes >= 60
    error_message = "idle_timeout_in_minutes must be >= 60 (AWS SageMaker minimum)."
  }
}

# --- Bastion (SSM tunnel to RDS) ---
variable "enable_bastion" {
  description = "Create a small EC2 bastion for SSM port-forwarding to RDS. Toggle on only when you need a DB tunnel, then back off."
  type        = bool
  default     = false
}

# --- Glue / Athena ---
variable "glue_database_name" {
  description = "Glue Data Catalog database for project tables"
  type        = string
  default     = "nutritionell"
}

variable "athena_workgroup_name" {
  description = "Athena workgroup"
  type        = string
  default     = "nutritionell-wg"
}