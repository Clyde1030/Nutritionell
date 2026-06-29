locals {
  custom_domain_enabled = var.enable_custom_domain && try(trimspace(var.custom_domain_name), "") != ""
  dns_zone_fqdn         = "${trimsuffix(var.dns_zone_name, ".")}."
  # Always include www.<apex> as a SAN/alias when using an apex custom domain.
  default_www_san_name = local.custom_domain_enabled && try(!startswith(var.custom_domain_name, "www."), false) ? "www.${var.custom_domain_name}" : null
  effective_san_names   = local.custom_domain_enabled ? distinct(compact(concat(var.custom_domain_san_names, local.default_www_san_name == null ? [] : [local.default_www_san_name]))) : []
  san_alias_names       = local.custom_domain_enabled && var.enable_cloudfront ? toset(local.effective_san_names) : toset([])
}

data "aws_route53_zone" "site" {
  provider     = aws.dns
  count        = local.custom_domain_enabled ? 1 : 0
  name         = local.dns_zone_fqdn
  private_zone = false
}

resource "aws_acm_certificate" "site" {
  provider                  = aws.us_east_1
  count                     = local.custom_domain_enabled ? 1 : 0
  domain_name               = var.custom_domain_name
  subject_alternative_names = local.effective_san_names
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

locals {
  cert_validation_options = local.custom_domain_enabled ? {
    for dvo in aws_acm_certificate.site[0].domain_validation_options : dvo.domain_name => {
      name  = dvo.resource_record_name
      type  = dvo.resource_record_type
      value = dvo.resource_record_value
    }
  } : {}
}

resource "aws_route53_record" "acm_validation" {
  provider = aws.dns
  for_each = local.cert_validation_options

  allow_overwrite = true
  zone_id         = data.aws_route53_zone.site[0].zone_id
  name            = each.value.name
  type            = each.value.type
  ttl             = 60
  records         = [each.value.value]
}

resource "aws_acm_certificate_validation" "site" {
  provider                = aws.us_east_1
  count                   = local.custom_domain_enabled ? 1 : 0
  certificate_arn         = aws_acm_certificate.site[0].arn
  validation_record_fqdns = [for r in aws_route53_record.acm_validation : r.fqdn]
}

resource "aws_cloudfront_distribution" "site" {
  count   = local.custom_domain_enabled && var.enable_cloudfront ? 1 : 0
  enabled = true

  is_ipv6_enabled = true
  aliases         = concat([var.custom_domain_name], local.effective_san_names)
  price_class     = var.cloudfront_price_class
  comment         = "${var.name_prefix} ${var.environment} distribution"

  origin {
    domain_name = aws_lb.this.dns_name
    origin_id   = "alb-origin"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    target_origin_id       = "alb-origin"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    allowed_methods = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods  = ["GET", "HEAD"]

    forwarded_values {
      query_string = true
      headers      = ["*"]

      cookies {
        forward = "all"
      }
    }

    min_ttl     = 0
    default_ttl = 0
    max_ttl     = 0
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.site[0].certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  depends_on = [aws_acm_certificate_validation.site]
}

resource "aws_route53_record" "site_a" {
  provider = aws.dns
  count    = local.custom_domain_enabled && var.enable_cloudfront ? 1 : 0

  zone_id = data.aws_route53_zone.site[0].zone_id
  name    = var.custom_domain_name
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.site[0].domain_name
    zone_id                = aws_cloudfront_distribution.site[0].hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "site_aaaa" {
  provider = aws.dns
  count    = local.custom_domain_enabled && var.enable_cloudfront ? 1 : 0

  zone_id = data.aws_route53_zone.site[0].zone_id
  name    = var.custom_domain_name
  type    = "AAAA"

  alias {
    name                   = aws_cloudfront_distribution.site[0].domain_name
    zone_id                = aws_cloudfront_distribution.site[0].hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "site_san_a" {
  provider = aws.dns
  for_each = local.san_alias_names

  zone_id = data.aws_route53_zone.site[0].zone_id
  name    = each.value
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.site[0].domain_name
    zone_id                = aws_cloudfront_distribution.site[0].hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "site_san_aaaa" {
  provider = aws.dns
  for_each = local.san_alias_names

  zone_id = data.aws_route53_zone.site[0].zone_id
  name    = each.value
  type    = "AAAA"

  alias {
    name                   = aws_cloudfront_distribution.site[0].domain_name
    zone_id                = aws_cloudfront_distribution.site[0].hosted_zone_id
    evaluate_target_health = false
  }
}