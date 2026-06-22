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
  default = 1
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
