# =====================================================================
# SageMaker Domain + user profiles + JupyterLab spaces
# Uses the DEFAULT VPC (separate from the custom VPC in network.tf).
# =====================================================================

data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

resource "aws_sagemaker_domain" "main" {
  domain_name = var.domain_name
  auth_mode   = "IAM"
  vpc_id      = data.aws_vpc.default.id
  subnet_ids  = data.aws_subnets.default.ids

  app_network_access_type = "PublicInternetOnly"

  default_user_settings {
    execution_role = data.aws_iam_role.existing_sagemaker_role.arn

    studio_web_portal   = "ENABLED"
    default_landing_uri = "studio::"

    canvas_app_settings {
      time_series_forecasting_settings {
        status = "ENABLED"
      }
      model_register_settings {
        status = "ENABLED"
      }
      workspace_settings {
        s3_artifact_path = "s3://sagemaker-${data.aws_caller_identity.current.account_id}-${data.aws_region.current.name}/canvas-artifacts"
      }
    }

    jupyter_server_app_settings {
      default_resource_spec {
        instance_type = "system"
      }
    }

    kernel_gateway_app_settings {
      default_resource_spec {
        instance_type = "ml.t3.medium"
      }
    }

    jupyter_lab_app_settings {
      default_resource_spec {
        instance_type = "ml.g5.xlarge"
      }

      app_lifecycle_management {
        idle_settings {
          lifecycle_management        = "ENABLED"
          min_idle_timeout_in_minutes = 60
          idle_timeout_in_minutes     = var.idle_timeout_in_minutes
          max_idle_timeout_in_minutes = 525600
        }
      }
    }

    tensor_board_app_settings {
      default_resource_spec {
        instance_type = "ml.t3.medium"
      }
    }

    studio_web_portal_settings {
      hidden_app_types = ["RStudioServerPro", "JupyterServer"]
    }
  }

  default_space_settings {
    execution_role = data.aws_iam_role.existing_sagemaker_role.arn

    jupyter_server_app_settings {
      default_resource_spec {
        instance_type = "system"
      }
    }

    kernel_gateway_app_settings {
      default_resource_spec {
        instance_type = "ml.t3.medium"
      }
    }

    jupyter_lab_app_settings {
      default_resource_spec {
        instance_type = "ml.g5.xlarge"
      }

      app_lifecycle_management {
        idle_settings {
          lifecycle_management        = "ENABLED"
          min_idle_timeout_in_minutes = 60
          idle_timeout_in_minutes     = var.idle_timeout_in_minutes
          max_idle_timeout_in_minutes = 525600
        }
      }
    }
  }

  domain_settings {
    docker_settings {
      enable_docker_access = "ENABLED"
    }
  }

  tags = {
    Name        = var.domain_name
    Environment = "development"
  }
}

resource "aws_sagemaker_user_profile" "users" {
  for_each = toset(var.user_profile_names)

  domain_id         = aws_sagemaker_domain.main.id
  user_profile_name = each.value

  user_settings {
    execution_role = data.aws_iam_role.existing_sagemaker_role.arn

    jupyter_server_app_settings {
      default_resource_spec {
        instance_type = "system"
      }
    }

    kernel_gateway_app_settings {
      default_resource_spec {
        instance_type = "ml.t3.medium"
      }
    }
  }

  tags = {
    Name = each.value
  }
}

resource "aws_sagemaker_space" "jupyter_spaces" {
  for_each = aws_sagemaker_user_profile.users

  domain_id  = aws_sagemaker_domain.main.id
  space_name = "${each.value.user_profile_name}-space"

  ownership_settings {
    owner_user_profile_name = each.value.user_profile_name
  }

  space_settings {
    app_type = "JupyterLab"

    jupyter_lab_app_settings {
      default_resource_spec {
        instance_type                 = "ml.g5.xlarge"
        sagemaker_image_arn           = "arn:aws:sagemaker:us-east-1:885854791233:image/sagemaker-distribution-gpu"
        sagemaker_image_version_alias = "4.1.3"
      }

      app_lifecycle_management {
        idle_settings {
          idle_timeout_in_minutes = var.idle_timeout_in_minutes
        }
      }
    }

    space_storage_settings {
      ebs_storage_settings {
        ebs_volume_size_in_gb = 30
      }
    }
  }

  space_sharing_settings {
    sharing_type = "Private"
  }

  tags = {
    Name = "${each.value.user_profile_name}-space"
  }
}