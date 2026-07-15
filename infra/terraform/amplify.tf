# Amplify Hosting for web_new (Next.js 14, App Router, with a few of its own
# server route handlers -- needs SSR compute, not a static bucket).
#
# `repository` / `access_token` are deliberately NOT set here: GitHub connections
# are meant to go through the Amplify GitHub App (an interactive OAuth consent
# you do once in the console), not a long-lived personal access token sitting in
# Terraform state. After apply, connect the repo once via:
#   Amplify console -> this app -> "Connect branch" -> GitHub -> select `main`.

resource "aws_amplify_app" "web_new" {
  count    = local.custom_domain_enabled ? 1 : 0
  name     = "${var.name_prefix}-web-new"
  platform = "WEB_COMPUTE" # Next.js SSR/route-handler support

  environment_variables = {
    NEXT_PUBLIC_API_URL = "https://${local.api_domain_name}"
  }

  # Monorepo setting: web_new lives at Application/web_new, not the repo root.
  build_spec = <<-YAML
    version: 1
    applications:
      - appRoot: Application/web_new
        frontend:
          phases:
            preBuild:
              commands:
                - npm ci
            build:
              commands:
                - npm run build
          artifacts:
            baseDirectory: .next
            files:
              - '**/*'
          cache:
            paths:
              - node_modules/**/*
  YAML
}

resource "aws_amplify_branch" "main" {
  count       = local.custom_domain_enabled ? 1 : 0
  app_id      = aws_amplify_app.web_new[0].id
  branch_name = "main"
  stage       = "PRODUCTION"

  enable_auto_build = true

  environment_variables = {
    NEXT_PUBLIC_API_URL = "https://${local.api_domain_name}"
  }
}

resource "aws_amplify_domain_association" "web_new" {
  count  = local.custom_domain_enabled ? 1 : 0
  app_id = aws_amplify_app.web_new[0].id

  domain_name = var.dns_zone_name

  # false: creating this resource must not block on DNS records that this same
  # apply hasn't created yet (the Route53 records below depend on its outputs).
  # Verification finishes async on AWS's side once those records exist.
  wait_for_verification = false

  sub_domain {
    branch_name = aws_amplify_branch.main[0].branch_name
    prefix      = var.app_subdomain
  }
}

locals {
  amplify_cert_validation_record = local.custom_domain_enabled ? split(
    " ", aws_amplify_domain_association.web_new[0].certificate_verification_dns_record
  ) : []

  amplify_subdomain_record = local.custom_domain_enabled ? split(
    " ", tolist(aws_amplify_domain_association.web_new[0].sub_domain)[0].dns_record
  ) : []
}

# ACM validation record for Amplify's managed certificate.
resource "aws_route53_record" "amplify_cert_validation" {
  provider = aws.dns
  count    = local.custom_domain_enabled ? 1 : 0

  zone_id = data.aws_route53_zone.site[0].zone_id
  name    = local.amplify_cert_validation_record[0]
  type    = local.amplify_cert_validation_record[1]
  ttl     = 60
  records = [trimsuffix(local.amplify_cert_validation_record[2], ".")]

  allow_overwrite = true
}

# Points app.<zone> at Amplify's CloudFront distribution for this app.
resource "aws_route53_record" "amplify_app_cname" {
  provider = aws.dns
  count    = local.custom_domain_enabled ? 1 : 0

  zone_id = data.aws_route53_zone.site[0].zone_id
  name    = local.amplify_subdomain_record[0]
  type    = local.amplify_subdomain_record[1]
  ttl     = 60
  records = [trimsuffix(local.amplify_subdomain_record[2], ".")]

  allow_overwrite = true
}
