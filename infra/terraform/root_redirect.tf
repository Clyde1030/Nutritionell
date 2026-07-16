# Redirects the bare domain + www to app.<zone> (web_new), 301, via the
# existing ALB -- no CloudFront/S3 needed. Kept off Amplify entirely: Amplify's
# own root-domain handling (auto-added subdomains + app-level custom_rule) is
# what got this stuck in UPDATE_FAILED earlier, so the apex/www hostnames stay
# out of the Amplify domain association and live on the ALB listener instead.

locals {
  root_domain_name = trimsuffix(var.dns_zone_name, ".")
  www_domain_name  = "www.${local.root_domain_name}"
}

resource "aws_acm_certificate" "root" {
  count                     = local.custom_domain_enabled ? 1 : 0
  domain_name               = local.root_domain_name
  subject_alternative_names = [local.www_domain_name]
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

locals {
  root_cert_validation_options = local.custom_domain_enabled ? {
    for dvo in aws_acm_certificate.root[0].domain_validation_options : dvo.domain_name => {
      name  = dvo.resource_record_name
      type  = dvo.resource_record_type
      value = dvo.resource_record_value
    }
  } : {}
}

resource "aws_route53_record" "root_cert_validation" {
  provider = aws.dns
  for_each = local.root_cert_validation_options

  allow_overwrite = true
  zone_id         = data.aws_route53_zone.site[0].zone_id
  name            = each.value.name
  type            = each.value.type
  ttl             = 60
  records         = [each.value.value]
}

resource "aws_acm_certificate_validation" "root" {
  count                   = local.custom_domain_enabled ? 1 : 0
  certificate_arn         = aws_acm_certificate.root[0].arn
  validation_record_fqdns = [for r in aws_route53_record.root_cert_validation : r.fqdn]
}

# Adds the root/www cert to the existing HTTPS listener via SNI, alongside the
# api.<zone> cert that's already the listener's default_action certificate.
resource "aws_lb_listener_certificate" "root" {
  count           = local.custom_domain_enabled ? 1 : 0
  listener_arn    = aws_lb_listener.https[0].arn
  certificate_arn = aws_acm_certificate_validation.root[0].certificate_arn
}

resource "aws_lb_listener_rule" "root_redirect" {
  count        = local.custom_domain_enabled ? 1 : 0
  listener_arn = aws_lb_listener.https[0].arn
  priority     = 100

  action {
    type = "redirect"
    redirect {
      host        = local.app_domain_name
      path        = "/#{path}"
      query       = "#{query}"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }

  condition {
    host_header {
      values = [local.root_domain_name, local.www_domain_name]
    }
  }
}

resource "aws_route53_record" "root_a" {
  provider = aws.dns
  count    = local.custom_domain_enabled ? 1 : 0

  zone_id = data.aws_route53_zone.site[0].zone_id
  name    = local.root_domain_name
  type    = "A"

  alias {
    name                   = aws_lb.this.dns_name
    zone_id                = aws_lb.this.zone_id
    evaluate_target_health = true
  }
}

resource "aws_route53_record" "www_a" {
  provider = aws.dns
  count    = local.custom_domain_enabled ? 1 : 0

  zone_id = data.aws_route53_zone.site[0].zone_id
  name    = local.www_domain_name
  type    = "A"

  alias {
    name                   = aws_lb.this.dns_name
    zone_id                = aws_lb.this.zone_id
    evaluate_target_health = true
  }
}

# No AAAA records: aws_lb.this (network.tf) is IPv4-only (see api_domain.tf).
