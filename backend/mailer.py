"""Transactional email through Brevo's HTTP API."""
import asyncio
from datetime import datetime
from html import escape

import requests

from config import APP_URL, BREVO_API_KEY, CONTACT_EMAIL, EMAIL_FROM, IS_PRODUCTION, logger

BREVO_SEND_URL = "https://api.brevo.com/v3/smtp/email"
RESET_LINK_MINUTES = 30
CONSENT_LINK_DAYS = 14


class EmailOff(Exception):
    """Email isn't set up on this server, so nothing can be sent. Not a failure outside production."""


def _undeliverable(to_email: str) -> bool:
    """example.com addresses don't exist. The tests create hundreds, and sending to them would use up the daily
    limit and harm the sender's reputation."""
    domain = (to_email or "").rsplit("@", 1)[-1].lower()
    return domain == "example.com" or domain.endswith(".example.com")


def _message_id(resp):
    try:
        return resp.json().get("messageId")
    except Exception:
        return None


def _send(to_email: str, to_name: str, subject: str, html: str, text: str):
    resp = requests.post(
        BREVO_SEND_URL,
        headers={"api-key": BREVO_API_KEY, "accept": "application/json"},
        json={"sender": {"name": "School of Maths", "email": EMAIL_FROM},
              "to": [{"email": to_email, "name": to_name or to_email}],
              "subject": subject, "htmlContent": html, "textContent": text},
        timeout=15,
    )
    resp.raise_for_status()
    return _message_id(resp)


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


def _day(iso_date: str) -> str:
    return datetime.fromisoformat(iso_date).strftime("%-d %b %Y")


def _ordinal(n: int) -> str:
    suffix = "th" if 10 <= n % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suffix}"


def _answers_text(t: dict) -> str:
    """"32 right, 5 wrong, 3 not attempted", or the plain count for old results that can't be split."""
    if t.get("wrong") is None:
        return f"{t.get('correct')}/{t.get('total')} correct"
    return f"{t.get('right', t.get('correct'))} right, {t['wrong']} wrong, {t['not_attempted']} not attempted"


def _test_line(t: dict) -> str:
    if t["status"] == "absent":
        return "Absent"
    if t["status"] == "excused":
        return "Excused"
    parts = [_answers_text(t), f"{t['score']:g}%"]
    if t.get("class_average") is not None:
        parts.append(f"class average {t['class_average']:g}%")
    if t.get("rank"):
        parts.append(f"{_ordinal(t['rank'])} of {t['sat']}")
    return " · ".join(parts)


def _overall_lines(o: dict) -> list:
    lines = []
    if o.get("average") is not None:
        line = f"Class-test average: {o['average']:g}%"
        if o.get("change"):
            line += f" ({'up' if o['change'] > 0 else 'down'} {abs(o['change']):g} from before this week)"
        lines.append(line)
    if o.get("rank"):
        lines.append(f"Class rank: {_ordinal(o['rank'])} of {o['ranked_students']}")
    if o.get("assigned"):
        lines.append(f"Attendance: {o['attended']} of {o['assigned']} class tests")
    return lines


def _topic_lines(topics: list) -> list:
    return [f"{t['topic']}: {t['correct']}/{t['total']} correct" for t in topics]


# Email clients ignore most modern CSS, so the design uses tables and inline styles only
_INK, _MUTED, _LINE, _YELLOW, _CREAM = "#1E293B", "#64748B", "#E2E8F0", "#F5C842", "#FFF9E8"
_GREEN, _GREEN_TINT, _AMBER, _AMBER_TINT, _RED, _RED_TINT = "#2F8A5F", "#EAF7EE", "#B7830F", "#FDF4DC", "#C93A2D", "#FDECEA"
_FONT = "font-family:Arial,Helvetica,sans-serif;"


def _score_color(score: float) -> str:
    return _GREEN if score >= 75 else _AMBER if score >= 55 else _RED


def _bar(percent: float, color: str) -> str:
    percent = max(0, min(100, round(percent)))
    # Table cells rather than a div width: Outlook and Gmail both draw this the same way
    filled = f'<td width="{percent}%" height="8" bgcolor="{color}" style="background:{color};font-size:0;line-height:0;border-radius:4px">&nbsp;</td>' if percent else ""
    rest = f'<td width="{100 - percent}%" height="8" style="font-size:0;line-height:0">&nbsp;</td>' if percent < 100 else ""
    return (f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="{_LINE}" style="background:{_LINE};border-radius:4px">'
            f"<tr>{filled}{rest}</tr></table>")


def _heading(title: str) -> str:
    return (f'<tr><td style="padding:24px 24px 10px;{_FONT}font-size:12px;font-weight:bold;letter-spacing:1px;'
            f'text-transform:uppercase;color:{_MUTED}">{escape(title)}</td></tr>')


def _stat(value: str, label: str, detail: str = "", detail_color: str = _MUTED) -> str:
    extra = f'<div style="{_FONT}font-size:12px;font-weight:bold;color:{detail_color};padding-top:2px">{escape(detail)}</div>' if detail else ""
    return (f'<td width="31%" valign="top" align="center" bgcolor="{_CREAM}" style="background:{_CREAM};padding:14px 4px;border-radius:10px">'
            f'<div style="{_FONT}font-size:22px;font-weight:bold;color:{_INK}">{escape(value)}</div>'
            f'<div style="{_FONT}font-size:12px;color:{_MUTED};padding-top:2px">{escape(label)}</div>{extra}</td>')


def _stats_html(o: dict) -> str:
    change = o.get("change")
    if change:
        detail = (f"\u25B2 {abs(change):g} up" if change > 0 else f"\u25BC {abs(change):g} down")
        detail_color = _GREEN if change > 0 else _RED
    else:
        detail, detail_color = "", _MUTED
    tiles = [_stat(f"{o['average']:g}%" if o.get("average") is not None else "\u2013", "Average", detail, detail_color),
             _stat(_ordinal(o["rank"]) if o.get("rank") else "\u2013", f"of {o['ranked_students']} in class" if o.get("rank") else "Class rank"),
             _stat(f"{o.get('attended', 0)}/{o.get('assigned', 0)}", "Tests attended")]
    gap = '<td width="8" style="width:8px;min-width:8px;font-size:1px;line-height:1px">&nbsp;</td>'
    return (f'<tr><td style="padding:0 24px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>{gap.join(tiles)}</tr></table></td></tr>')


def _answer_counts_html(t: dict) -> str:
    if t.get("wrong") is None:
        return ""
    def part(mark: str, count: int, label: str, color: str) -> str:
        return f'<span style="color:{color};font-weight:bold;white-space:nowrap">{mark} {count} {label}</span>'
    parts = [part("\u2713", t.get("right", t.get("correct")), "right", _GREEN), part("\u2717", t["wrong"], "wrong", _RED),
             part("\u2013", t["not_attempted"], "not attempted", _MUTED)]
    return f'<div style="{_FONT}font-size:13px;line-height:1.7;padding-top:10px">{" &nbsp;·&nbsp; ".join(parts)}</div>'


def _test_card(t: dict) -> str:
    title = f'<div style="{_FONT}font-size:15px;font-weight:bold;color:{_INK}">{escape(t["title"])}</div>'
    if t["status"] != "taken":
        absent = t["status"] == "absent"
        color, tint, label = (_RED, _RED_TINT, "Absent") if absent else (_MUTED, "#F1F5F9", "Excused")
        body = (f'<div style="padding-top:8px"><span style="{_FONT}display:inline-block;padding:3px 10px;border-radius:12px;background:{tint};'
                f'color:{color};font-size:13px;font-weight:bold">{label}</span></div>')
    else:
        color = _score_color(t["score"])
        facts = [f"{t.get('correct')}/{t.get('total')} correct"] if t.get("wrong") is None else []
        if t.get("rank"):
            facts.append(f"{_ordinal(t['rank'])} of {t['sat']}")
        if t.get("class_average") is not None:
            facts.append(f"Class average {t['class_average']:g}%")
        body = (f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px"><tr>'
                f'<td valign="middle" width="84" style="{_FONT}font-size:28px;font-weight:bold;color:{color}">{t["score"]:g}%</td>'
                f'<td valign="middle" style="{_FONT}font-size:13px;line-height:1.5;color:{_INK}">{"<br>".join(escape(f) for f in facts)}</td></tr></table>'
                f'<div style="padding-top:10px">{_bar(t["score"], color)}</div>'
                + _answer_counts_html(t))
    return (f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid {_LINE};border-radius:12px;margin-bottom:10px">'
            f'<tr><td style="padding:14px 16px">{title}{body}</td></tr></table>')


def _topic_rows(topics: list, color: str) -> str:
    rows = ""
    for t in topics:
        rows += (f'<tr><td style="padding-bottom:12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>'
                 f'<td style="{_FONT}font-size:14px;color:{_INK};padding-bottom:5px">{escape(t["topic"])}</td>'
                 f'<td align="right" style="{_FONT}font-size:13px;font-weight:bold;color:{color};padding-bottom:5px;white-space:nowrap">{t["correct"]}/{t["total"]}</td></tr></table>'
                 f'{_bar(t["accuracy"], color)}</td></tr>')
    return rows


def _topics_section(title: str, topics: list, color: str) -> str:
    if not topics:
        return ""
    return (_heading(title) + f'<tr><td style="padding:0 24px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">{_topic_rows(topics, color)}</table></td></tr>')


def render_weekly_report(report: dict) -> tuple:
    """(subject, html, text) for a parent's report. Everything from the database is escaped."""
    name = report["student_name"]
    subject = f"{name}'s weekly report from School of Maths"
    contact = f"Questions, or to stop these emails? Write to {CONTACT_EMAIL}." if CONTACT_EMAIL else "Questions, or to stop these emails? Please speak to the teacher."
    footer = f"Only class tests set by the teacher are counted. Practice isn't. A missed class test counts as 0 in the average and class rank. {contact}"
    dates = f"{_day(report['week_start'])} to {_day(report['week_end'])}"
    heading = f"{report['batch_name']} · Class {report.get('class_level')} · {dates}"
    overall_data = report.get("overall") or {}
    strong_data, weak_data = report.get("strong_topics") or [], report.get("weak_topics") or []
    note = report.get("teacher_note")

    note_html = ""
    if note:
        note_html = (_heading("Note from the teacher") + f'<tr><td style="padding:0 24px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">'
                     f'<tr><td bgcolor="#EEF4FA" style="background:#EEF4FA;border-left:4px solid #3E7CB1;border-radius:6px;padding:12px 14px;{_FONT}font-size:14px;line-height:1.5;color:{_INK}">{escape(note)}</td></tr></table></td></tr>')
    html = (
        f'<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        f'<meta name="color-scheme" content="light"><title>{escape(subject)}</title></head>'
        f'<body style="margin:0;padding:0;background:#F1F5F9">'
        # Shown beside the subject in the inbox list
        f'<div style="display:none;max-height:0;overflow:hidden;opacity:0">{escape(report["summary"])}</div>'
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#F1F5F9" style="background:#F1F5F9"><tr><td align="center" style="padding:16px 8px">'
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#FFFFFF" style="max-width:560px;background:#FFFFFF;border-radius:16px;overflow:hidden">'
        # Header
        f'<tr><td bgcolor="{_YELLOW}" style="background:{_YELLOW};padding:22px 24px 24px">'
        f'<div style="{_FONT}font-size:13px;font-weight:bold;color:{_INK}">School of Maths</div>'
        f'<div style="{_FONT}font-size:26px;line-height:1.2;font-weight:bold;color:{_INK};padding-top:10px">{escape(name)}\'s weekly report</div>'
        f'<div style="{_FONT}font-size:13px;line-height:1.5;color:{_INK};padding-top:6px">{escape(report["batch_name"])} · Class {escape(str(report.get("class_level")))}<br>{escape(dates)}</div>'
        f'</td></tr>'
        # Summary
        f'<tr><td style="padding:22px 24px 16px;{_FONT}font-size:17px;line-height:1.45;font-weight:bold;color:{_INK}">{escape(report["summary"])}</td></tr>'
        + _stats_html(overall_data)
        + _heading("This week's class tests")
        + f'<tr><td style="padding:0 24px">{"".join(_test_card(t) for t in report["tests"])}</td></tr>'
        + _topics_section("Going well", strong_data, _GREEN)
        + _topics_section("Needs work", weak_data, _RED)
        + _heading("Next step")
        + f'<tr><td style="padding:0 24px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>'
          f'<td bgcolor="{_CREAM}" style="background:{_CREAM};border-left:4px solid {_YELLOW};border-radius:6px;padding:12px 14px;{_FONT}font-size:15px;line-height:1.5;font-weight:bold;color:{_INK}">{escape(report["next_step"])}</td></tr></table></td></tr>'
        + note_html
        + f'<tr><td style="padding:24px;{_FONT}font-size:12px;line-height:1.5;color:{_MUTED}">{escape(footer)}</td></tr>'
        f'</table></td></tr></table></body></html>')

    overall = _overall_lines(overall_data)
    strong, weak = _topic_lines(strong_data), _topic_lines(weak_data)
    text_lines = [f"{name}'s weekly report", f"School of Maths · {heading}", "", report["summary"], "", "CLASS TESTS"]
    text_lines += [f"- {t['title']}: {_test_line(t)}" for t in report["tests"]]
    for title, lines in (("OVERALL SO FAR", overall), ("GOING WELL", strong), ("NEEDS WORK", weak)):
        if lines:
            text_lines += ["", title] + [f"- {line}" for line in lines]
    text_lines += ["", "NEXT STEP", report["next_step"]]
    if note:
        text_lines += ["", "NOTE FROM THE TEACHER", note]
    text_lines += ["", footer]
    return subject, html, "\n".join(text_lines) + "\n"


async def send_weekly_report(to_email: str, parent_name: str, report: dict):
    """Returns Brevo's message id. Unlike the other emails this raises on failure, so the queue can retry."""
    if not (BREVO_API_KEY and EMAIL_FROM):
        if IS_PRODUCTION:
            raise RuntimeError("Email is not configured")
        raise EmailOff()
    subject, html, text = render_weekly_report(report)
    return await asyncio.to_thread(_send, to_email, parent_name, subject, html, text)
