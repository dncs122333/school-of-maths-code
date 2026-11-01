"""PDF generation engine with primary WeasyPrint pipeline and robust ReportLab fallback."""
import io
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any
from xml.sax.saxutils import escape

logger = logging.getLogger("reports.pdf")


def _escape(val: Any) -> str:
    """Escapes XML entities (&, <, >) to prevent corrupting ReportLab Paragraph markup."""
    if val is None:
        return ""
    return escape(str(val))


def _render_reportlab_test_report(report: Dict[str, Any], generated_date: str) -> bytes:
    """Fallback generator using ReportLab (pure-Python, zero external C-dependencies)."""
    from reportlab.lib.pagesizes import letter
    from reportlab.lib import colors
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether
    )
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        leftMargin=36,
        rightMargin=36,
        topMargin=36,
        bottomMargin=36
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "DocTitle",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=18,
        leading=22,
        textColor=colors.HexColor("#1E293B"),
        spaceAfter=2
    )
    sub_style = ParagraphStyle(
        "DocSub",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8,
        leading=10,
        textColor=colors.HexColor("#475569"),
        textTransform="uppercase",
        spaceAfter=12
    )
    meta_style = ParagraphStyle(
        "MetaText",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        leading=12,
        textColor=colors.HexColor("#1E293B")
    )
    heading_style = ParagraphStyle(
        "SectionHeading",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=11,
        leading=14,
        textColor=colors.HexColor("#1E293B"),
        spaceBefore=10,
        spaceAfter=6
    )
    cell_style = ParagraphStyle(
        "CellText",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8,
        leading=10,
        textColor=colors.HexColor("#1E293B")
    )
    cell_bold = ParagraphStyle(
        "CellBold",
        parent=cell_style,
        fontName="Helvetica-Bold"
    )

    story = []

    # Header
    story.append(Paragraph("SCHOOL OF MATHS", title_style))
    story.append(Paragraph(f"Official Batch Assessment Report · Generated on {_escape(generated_date)}", sub_style))

    # Meta Table
    meta_data = [
        [
            Paragraph(f"<b>Test:</b> {_escape(report.get('title'))}", meta_style),
            Paragraph(f"<b>Class:</b> {_escape(report.get('class_level'))} · {_escape(report.get('subject'))}", meta_style),
        ],
        [
            Paragraph(f"<b>Chapter:</b> {_escape(report.get('chapter') or 'General')}", meta_style),
            Paragraph(f"<b>Duration:</b> {_escape(report.get('duration_minutes'))} mins", meta_style),
        ]
    ]
    meta_table = Table(meta_data, colWidths=[270, 270])
    meta_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#FFF9E8")),
        ('BOX', (0, 0), (-1, -1), 1.5, colors.HexColor("#1E293B")),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 10))

    # KPI Summary Table
    summary = report.get("summary", {})

    def _pct(v):
        return "—" if v is None else f"{v}%"

    kpi_data = [
        ["Class Average", "Median Score", "Topper Score", "Completion Rate"],
        [
            f"{_pct(summary.get('avg_score'))} ({summary.get('score_band', '')})" if summary.get('avg_score') is not None else "—",
            _pct(summary.get('median_score')),
            _pct(summary.get('topper_score')),
            (
                f"{report.get('completion_rate')}% ({report.get('submitted_count')}/{report.get('enrolled_count')})"
                if (report.get('completion_rate') is not None and report.get('enrolled_count') is not None)
                else f"N/A ({report.get('submitted_count', 0)} submitted)"
            )
        ]
    ]
    kpi_table = Table(kpi_data, colWidths=[135, 135, 135, 135])
    kpi_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#1E293B")),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), "Helvetica-Bold"),
        ('FONTSIZE', (0, 0), (-1, 0), 8),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('BACKGROUND', (0, 1), (-1, 1), colors.HexColor("#F8FAFC")),
        ('BOX', (0, 0), (-1, -1), 1.5, colors.HexColor("#1E293B")),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
        ('BOTTOMPADDING', (0, 1), (-1, 1), 8),
        ('TOPPADDING', (0, 1), (-1, 1), 8),
    ]))
    story.append(kpi_table)
    story.append(Spacer(1, 12))

    # Score Distribution Table
    dist = report.get("score_distribution", {})
    dist_data = [
        ["0-39% (Critical)", "40-54% (Weak)", "55-74% (Developing)", "75-89% (Proficient)", "90-100% (Mastery)"],
        [str(dist.get("0-39", 0)), str(dist.get("40-54", 0)), str(dist.get("55-74", 0)), str(dist.get("75-89", 0)), str(dist.get("90-100", 0))]
    ]
    dist_table = Table(dist_data, colWidths=[108, 108, 108, 108, 108])
    dist_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#334155")),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), "Helvetica-Bold"),
        ('FONTSIZE', (0, 0), (-1, 0), 7.5),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('BOX', (0, 0), (-1, -1), 1, colors.HexColor("#1E293B")),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    story.append(Paragraph("Score Distribution", heading_style))
    story.append(dist_table)
    story.append(Spacer(1, 12))

    # Question Psychometrics Table
    q_analysis = report.get("question_analysis") or []
    if q_analysis:
        story.append(Paragraph("Question Analysis & Discrimination Index", heading_style))
        q_table_data = [
            ["#", "Topic", "Diff", "Accuracy", "Discrimination (D)", "Rating", "Avg Time"]
        ]
        for q in q_analysis[:25]:  # Safety cap per page
            d_val = str(q.get("discrimination_index")) if q.get("discrimination_index") is not None else "—"
            q_table_data.append([
                Paragraph(f"Q{q.get('index')}", cell_bold),
                Paragraph(_escape(q.get("topic")), cell_style),
                Paragraph(_escape(q.get("difficulty")), cell_style),
                Paragraph(f"{q.get('accuracy')}%", cell_bold),
                Paragraph(_escape(d_val), cell_style),
                Paragraph(_escape(q.get("discrimination_rating")), cell_style),
                Paragraph(f"{q.get('avg_time_s')}s", cell_style)
            ])
        q_table = Table(q_table_data, colWidths=[25, 175, 45, 55, 95, 85, 60])
        q_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#1E293B")),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), "Helvetica-Bold"),
            ('FONTSIZE', (0, 0), (-1, 0), 7.5),
            ('BOX', (0, 0), (-1, -1), 1, colors.HexColor("#1E293B")),
            ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ]))
        story.append(q_table)

    doc.build(story)
    return buffer.getvalue()


def render_test_report_pdf(report_data: Dict[str, Any]) -> bytes:
    """Generates an un-watermarked, official PDF report for a test using ReportLab."""
    now_iso = datetime.now(timezone.utc).strftime("%d %B %Y, %I:%M %p UTC")
    return _render_reportlab_test_report(report_data, now_iso)
