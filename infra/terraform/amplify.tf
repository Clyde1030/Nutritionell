# Amplify Hosting for web_new (Next.js 14, App Router, with a few of its own
# server route handlers -- needs SSR compute, not a static bucket).
#
# `access_token` is deliberately NOT set/kept here: connecting the repo was a
# one-off `aws amplify update-app --access-token ...` CLI call (2026-07-15) --
# AWS uses that token once to create its own webhook + deploy key and doesn't
# need it again, so it was never worth persisting in Terraform state. Once
# connected, though, `repository` itself must be mirrored in this resource, or
# the next `terraform apply` would see it as drift and null the connection
# back out (repository isn't set anywhere else, so Terraform would "correct"
# it to absent).
resource "aws_amplify_app" "web_new" {
  count      = local.custom_domain_enabled ? 1 : 0
  name       = "${var.name_prefix}-web-new"
  platform   = "WEB_COMPUTE" # Next.js SSR/route-handler support
  repository = "https://github.com/clyde1030/nutritionell"

  environment_variables = {
    NEXT_PUBLIC_API_URL       = "https://${local.api_domain_name}"
    AMPLIFY_MONOREPO_APP_ROOT = "Application/web_new"
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
    NEXT_PUBLIC_API_URL       = "https://${local.api_domain_name}"
    AMPLIFY_MONOREPO_APP_ROOT = "Application/web_new"
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
