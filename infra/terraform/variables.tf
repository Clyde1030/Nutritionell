variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "environment" {
  type    = string
  default = "prod"
}

variable "name_prefix" {
  type    = string
  default = "nutritionell"
}

# # --- Networking ---
# variable "vpc_cidr" {
#   type    = string
#   default = "10.0.0.0/16"
# }

# # --- Database ---
# variable "db_name" {
#   type    = string
#   default = "nutritionell_db"
# }

# variable "db_username" {
#   type    = string
#   default = "nutritionell"
# }

# variable "db_instance_class" {
#   type    = string
#   default = "db.t4g.micro" # cheap to start; bump for production load
# }

# variable "db_allocated_storage" {
#   type    = number
#   default = 20
# }

# # --- Application ---
# variable "container_image_tag" {
#   type    = string
#   default = "latest"
# }

# variable "desired_count" {
#   type    = number
#   default = 1
# }

# variable "task_cpu" {
#   type    = number
#   default = 512 # 0.5 vCPU
# }

# variable "task_memory" {
#   type    = number
#   default = 1024 # 1 GB
# }

# # --- LLM key ---
# # Pass via TF_VAR_gemini_api_key env var or a tfvars file you DON'T commit.
# variable "gemini_api_key" {
#   type      = string
#   sensitive = true
# }

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

# # --- SageMaker ---
# variable "domain_name" {
#   description = "Name for the SageMaker domain"
#   type        = string
#   default     = "CapstoneTeam-Domain-tf"
# }

# variable "user_profile_names" {
#   description = "One SageMaker user profile per team member"
#   type        = list(string)
#   default     = ["yusheng", "steven", "priyanka", "najmeh"]
# }

# variable "idle_timeout_in_minutes" {
#   description = "Auto-stop JupyterLab apps after this many minutes of inactivity (AWS requires >= 60)"
#   type        = number
#   default     = 60
#
#   validation {
#     condition     = var.idle_timeout_in_minutes >= 60
#     error_message = "idle_timeout_in_minutes must be >= 60 (AWS SageMaker minimum)."
#   }
# }

# # --- Glue / Athena ---
# variable "glue_database_name" {
#   description = "Glue Data Catalog database for project tables"
#   type        = string
#   default     = "nutritionell"
# }

# variable "athena_workgroup_name" {
#   description = "Athena workgroup"
#   type        = string
#   default     = "nutritionell-wg"
# }
