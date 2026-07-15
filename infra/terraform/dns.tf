# Shared Route53 lookup + domain names for api.<zone> (ALB) and app.<zone> (Amplify).
# Gated behind enable_custom_domain so plans stay a no-op until you're ready to cut over.
locals {
  custom_domain_enabled = var.enable_custom_domain
  dns_zone_fqdn         = "${trimsuffix(var.dns_zone_name, ".")}."
  api_domain_name       = "${var.api_subdomain}.${trimsuffix(var.dns_zone_name, ".")}"
  app_domain_name       = "${var.app_subdomain}.${trimsuffix(var.dns_zone_name, ".")}"
}

data "aws_route53_zone" "site" {
  provider     = aws.dns
  count        = local.custom_domain_enabled ? 1 : 0
  name         = local.dns_zone_fqdn
  private_zone = false
}
