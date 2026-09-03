"""
Transactional email via AWS SES.

Only the password-reset email today. Credentials come from the ECS task role at
runtime (or the ambient AWS profile locally) — boto3's default chain, same as
the rest of the app.

This module does NOT check whether the SES identity is verified or whether the
account is out of the sandbox. Those are operational facts, not application
branches: see infra/AWS_SETUP_LOGIN_FEATURE.md. A send that fails for either
reason surfaces as a logged error and a False return, which the caller treats as
non-fatal so the API never leaks whether an address exists.
"""
import logging
from urllib.parse import quote

from app.config import settings

logger = logging.getLogger(__name__)


def _client():
    # Imported lazily so importing this module (and therefore the app) does not
    # require boto3 to be installed or AWS to be reachable — matters for tests
    # and for local runs that never send mail.
    import boto3

    return boto3.client("ses", region_name=settings.aws_region)


def build_reset_url(raw_token: str) -> str:
    """`<app_base_url>/?reset_token=<token>` — the shape the frontend expects."""
    return f"{settings.app_base_url.rstrip('/')}/?reset_token={quote(raw_token, safe='')}"


def send_password_reset_email(to_address: str, raw_token: str) -> bool:
    """Send the reset link. Returns True on success, False on any failure.

    Never raises: the forgot-password endpoint answers 200 regardless of whether
    the address exists or the mail went out, so that a caller cannot use it to
    enumerate accounts.
    """
    reset_url = build_reset_url(raw_token)
    minutes = settings.password_reset_token_expire_minutes

    subject = "Reset your Nutritionell password"
    text_body = (
        "We received a request to reset the password for your Nutritionell account.\n\n"
        f"Reset it here (the link expires in {minutes} minutes and can be used once):\n"
        f"{reset_url}\n\n"
        "If you didn't ask for this, you can ignore this email — your password will not change.\n"
    )
    html_body = f"""\
<html>
  <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1b1f24;">
    <p>We received a request to reset the password for your Nutritionell account.</p>
    <p>
      <a href="{reset_url}"
         style="display:inline-block;padding:12px 22px;border-radius:8px;
                background:#1f6feb;color:#ffffff;text-decoration:none;font-weight:600;">
        Reset your password
      </a>
    </p>
    <p style="color:#6b7480;font-size:13px;">
      This link expires in {minutes} minutes and can be used once.
      If you didn't ask for this, you can ignore this email — your password will not change.
    </p>
    <p style="color:#6b7480;font-size:12px;word-break:break-all;">{reset_url}</p>
  </body>
</html>"""

    try:
        _client().send_email(
            Source=settings.ses_from_address,
            Destination={"ToAddresses": [to_address]},
            Message={
                "Subject": {"Data": subject, "Charset": "UTF-8"},
                "Body": {
                    "Text": {"Data": text_body, "Charset": "UTF-8"},
                    "Html": {"Data": html_body, "Charset": "UTF-8"},
                },
            },
        )
        logger.info("Password reset email sent")
        return True
    except Exception as exc:  # noqa: BLE001 — a mail failure must not 500 the request
        # Deliberately does not log `to_address`: the whole point of the
        # always-200 contract is not recording who asked for a reset.
        logger.error("Failed to send password reset email via SES: %s", exc)
        return False


# ── TEMPORARY admin-approval gate ────────────────────────────────────────────
# Goes away with the rest of the feature; see app/routers/admin.py.

def send_new_signup_notification(new_user_email: str) -> bool:
    """Tell the admin that an account is waiting for approval.

    Best-effort by contract: the caller has already committed the account, so a
    failure here must be logged and swallowed, never raised. Returns True/False
    only so tests and callers can observe the outcome.
    """
    to_address = settings.admin_notification_email
    subject = f"Nutritionell — new signup pending approval: {new_user_email}"
    text_body = (
        "A new account just signed up and is waiting for approval.\n\n"
        f"  Email: {new_user_email}\n\n"
        "Approve it with the admin API — see the 'Admin approval (temporary)' "
        "section of Application/backend/README.md:\n\n"
        "  GET  /api/admin/users/pending\n"
        "  POST /api/admin/users/<user_id>/approve\n"
    )
    html_body = f"""\
<html>
  <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1b1f24;">
    <p>A new account just signed up and is waiting for approval.</p>
    <p><strong>{new_user_email}</strong></p>
    <p style="color:#6b7480;font-size:13px;">
      Approve it with the admin API — see the
      &ldquo;Admin approval (temporary)&rdquo; section of
      <code>Application/backend/README.md</code>:
    </p>
    <pre style="background:#f6f7f9;padding:10px;border-radius:6px;font-size:12px;">GET  /api/admin/users/pending
POST /api/admin/users/&lt;user_id&gt;/approve</pre>
  </body>
</html>"""

    try:
        _client().send_email(
            Source=settings.ses_from_address,
            Destination={"ToAddresses": [to_address]},
            Message={
                "Subject": {"Data": subject, "Charset": "UTF-8"},
                "Body": {
                    "Text": {"Data": text_body, "Charset": "UTF-8"},
                    "Html": {"Data": html_body, "Charset": "UTF-8"},
                },
            },
        )
        logger.info("New-signup admin notification sent")
        return True
    except Exception as exc:  # noqa: BLE001 — must never fail a signup
        logger.error("Failed to send new-signup admin notification: %s", exc)
        return False
