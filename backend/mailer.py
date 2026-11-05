"""Transactional email through Brevo's HTTP API."""
import asyncio
from html import escape

import requests

from config import APP_URL, BREVO_API_KEY, EMAIL_FROM, IS_PRODUCTION, logger

BREVO_SEND_URL = "https://api.brevo.com/v3/smtp/email"
RESET_LINK_MINUTES = 30
CONSENT_LINK_DAYS = 14


def _undeliverable(to_email: str) -> bool:
    """example.com addresses don't exist. The tests create hundreds, and sending to them would use up the daily
    limit and harm the sender's reputation."""
    domain = (to_email or "").rsplit("@", 1)[-1].lower()
    return domain == "example.com" or domain.endswith(".example.com")


def _send(to_email: str, to_name: str, subject: str, html: str, text: str) -> None:
    resp = requests.post(
        BREVO_SEND_URL,
        headers={"api-key": BREVO_API_KEY, "accept": "application/json"},
        json={"sender": {"name": "School of Maths", "email": EMAIL_FROM},
              "to": [{"email": to_email, "name": to_name or to_email}],
              "subject": subject, "htmlContent": html, "textContent": text},
        timeout=15,
    )
    resp.raise_for_status()


async def send_password_reset(to_email: str, to_name: str, token: str) -> None:
    """Never raises: this runs after the response has gone, so failures can only be logged."""
    if _undeliverable(to_email):
        return
    link = f"{APP_URL}/reset-password?token={token}"
    if not (BREVO_API_KEY and EMAIL_FROM):
        if IS_PRODUCTION:
            logger.error("BREVO_API_KEY or EMAIL_FROM is not set: a password reset email was not sent")
        else:
            logger.info(f"Password reset link (email is not configured here): {link}")
        return
    name = escape(to_name or "there")
    html = (f"<p>Hi {name},</p><p>Use this link to choose a new School of Maths password. "
            f"It works once and expires in {RESET_LINK_MINUTES} minutes.</p>"
            f'<p><a href="{escape(link)}">Choose a new password</a></p>'
            "<p>If you didn't ask for this, you can ignore this email. Your password hasn't changed.</p>")
    text = (f"Hi {to_name or 'there'},\n\nUse this link to choose a new School of Maths password. "
            f"It works once and expires in {RESET_LINK_MINUTES} minutes.\n\n{link}\n\n"
            "If you didn't ask for this, you can ignore this email. Your password hasn't changed.\n")
    try:
        await asyncio.to_thread(_send, to_email, to_name, "Reset your School of Maths password", html, text)
    except Exception as e:
        # Only the error's type: a response or URL could carry the address or key
        logger.error(f"Password reset email failed: {type(e).__name__}")


async def send_parent_consent(to_email: str, parent_name: str, student_name: str, token: str) -> None:
    """Never raises: this runs after the response has gone, so failures can only be logged. The teacher can
    resend the email or record a signed form instead."""
    if _undeliverable(to_email):
        return
    link = f"{APP_URL}/parent-consent?token={token}"
    if not (BREVO_API_KEY and EMAIL_FROM):
        if IS_PRODUCTION:
            logger.error("BREVO_API_KEY or EMAIL_FROM is not set: a parent consent email was not sent")
        else:
            logger.info(f"Parent consent link (email is not configured here): {link}")
        return
    parent, student = escape(parent_name or "there"), escape(student_name or "your child")
    html = (f"<p>Dear {parent},</p><p>{student} has signed up at School of Maths with this email as their parent's. "
            f"They can start once you agree. Please open this link to read and confirm. "
            f"It expires in {CONSENT_LINK_DAYS} days.</p>"
            f'<p><a href="{escape(link)}">Review and agree</a></p>'
            "<p>If you don't know this student, or don't agree, please ignore this email. Their access stays closed.</p>")
    text = (f"Dear {parent_name or 'there'},\n\n{student_name or 'Your child'} has signed up at School of Maths with this "
            f"email as their parent's. They can start once you agree. Please open this link to read and confirm. "
            f"It expires in {CONSENT_LINK_DAYS} days.\n\n{link}\n\n"
            "If you don't know this student, or don't agree, please ignore this email. Their access stays closed.\n")
    try:
        await asyncio.to_thread(_send, to_email, parent_name, f"Please confirm {student_name or 'your child'}'s School of Maths account", html, text)
    except Exception as e:
        # Only the error's type: a response or URL could carry the address or key
        logger.error(f"Parent consent email failed: {type(e).__name__}")
