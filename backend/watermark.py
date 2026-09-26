"""Burned-in recipient watermark for materials (PDF + raster images).

The mark is composited into the FILE, not drawn over the page, so it survives
download, re-sharing, printing and opening in any other application. Styling
mirrors the on-screen note watermark: diagonal, tiled, low-contrast, carrying
only the recipient's "name • email".

Applied per request (never stored) so a file always names whoever actually
opened it. Callers treat this as best-effort: `apply_watermark` returns the
original bytes unchanged if the format cannot carry a mark or rendering fails —
a broken watermark must never make a material unreachable.
"""
import io
from typing import Optional

from config import logger

# Formats the mark can be burned into. docx/pptx cannot be marked reliably
# (phase 3 converts them to PDF); txt has nowhere to put it.
PDF_EXTS = {"pdf"}
IMAGE_EXTS = {"png", "jpg", "jpeg", "webp", "gif"}
WATERMARKABLE_EXTS = PDF_EXTS | IMAGE_EXTS

# Tile geometry — matches the 380x200 rotated tile of the note overlay.
_TILE_W = 380
_TILE_H = 200
_ANGLE = 25
_FONT_CANDIDATES = (
    "/usr/share/fonts/truetype/liberation/LiberationMono-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf",
)


def display_text(name: Optional[str], email: Optional[str]) -> str:
    """"Name • email", the same label the on-screen note watermark uses."""
    n = (name or "Student").strip() or "Student"
    e = (email or "").strip()
    return f"{n} • {e}" if e else n


def _fitted_font_size(text: str) -> float:
    """Shrink the glyph size as the label grows so it never clips the tile."""
    if not text:
        return 13.0
    return max(9.0, min(13.0, (_TILE_W / (len(text) * 7.8)) * 13.0))


# ------------------------------- PDF -------------------------------

def _pdf_overlay_page(width: float, height: float, text: str):
    """A single transparent page of tiled, rotated watermark text."""
    from reportlab.lib.colors import Color
    from reportlab.pdfgen import canvas

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(width, height))
    size = _fitted_font_size(text)
    try:
        c.setFont("Courier-Bold", size)
    except Exception:
        c.setFont("Helvetica-Bold", size)
    # Dark, low-alpha ink: legible on white paper, still reads through content.
    c.setFillColor(Color(15 / 255, 23 / 255, 42 / 255, alpha=0.18))
    try:
        c.setFillAlpha(0.18)
    except Exception:
        pass

    # Over-cover the page so rotated text still reaches the corners.
    for row in range(-1, int(height // _TILE_H) + 2):
        for col in range(-1, int(width // _TILE_W) + 2):
            c.saveState()
            c.translate(col * _TILE_W + _TILE_W / 2, row * _TILE_H + _TILE_H / 2)
            c.rotate(_ANGLE)
            c.drawCentredString(0, 0, text)
            c.restoreState()
    c.save()
    buf.seek(0)

    from pypdf import PdfReader
    return PdfReader(buf).pages[0]


def _watermark_pdf(data: bytes, text: str) -> bytes:
    from pypdf import PdfReader, PdfWriter

    reader = PdfReader(io.BytesIO(data))
    if getattr(reader, "is_encrypted", False):
        try:
            reader.decrypt("")  # owner-locked but readable PDFs
        except Exception:
            logger.warning("watermark: encrypted PDF left unmarked")
            return data

    writer = PdfWriter()
    overlays = {}  # page geometry -> overlay page, so an N-page doc renders it once
    for page in reader.pages:
        box = page.mediabox
        w, h = float(box.width), float(box.height)
        key = (round(w, 1), round(h, 1))
        if key not in overlays:
            overlays[key] = _pdf_overlay_page(w, h, text)
        try:
            page.merge_page(overlays[key])
        except Exception as e:
            logger.warning(f"watermark: page merge failed ({e}); page left unmarked")
        writer.add_page(page)

    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


# ------------------------------ Images ------------------------------

def _watermark_image(data: bytes, text: str, ext: str) -> bytes:
    from PIL import Image, ImageDraw, ImageFont

    img = Image.open(io.BytesIO(data))
    is_animated = getattr(img, "is_animated", False)
    if is_animated:
        # Marking every frame of an animation is out of scope; the first frame
        # carries the mark and the result is a still image.
        img.seek(0)
    img = img.convert("RGBA")
    w, h = img.size

    # Scale the tile with the image so the mark stays proportionate on both a
    # small diagram and a full-page scan.
    scale = max(1.0, min(3.0, max(w, h) / 900))
    size = max(11, int(_fitted_font_size(text) * scale * 1.15))
    font = None
    for path in _FONT_CANDIDATES:
        try:
            font = ImageFont.truetype(path, size)
            break
        except Exception:
            continue
    if font is None:
        font = ImageFont.load_default()

    # Draw the tiled text on an oversized layer, then rotate and centre-crop it
    # so the diagonal mark covers the corners too.
    diag = int((w ** 2 + h ** 2) ** 0.5) + 2 * size
    layer = Image.new("RGBA", (diag, diag), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    try:
        tw = int(draw.textlength(text, font=font))
    except Exception:
        tw = size * len(text) // 2
    step_x = max(tw + int(60 * scale), 80)
    step_y = max(int(_TILE_H * scale * 0.5), 60)
    for y in range(0, diag, step_y):
        offset = (y // step_y % 2) * (step_x // 2)  # stagger rows
        for x in range(-step_x, diag, step_x):
            draw.text((x + offset, y), text, font=font, fill=(15, 23, 42, 56))

    layer = layer.rotate(_ANGLE, resample=Image.BICUBIC)
    left, top = (layer.width - w) // 2, (layer.height - h) // 2
    layer = layer.crop((left, top, left + w, top + h))

    marked = Image.alpha_composite(img, layer)
    out = io.BytesIO()
    if ext in ("jpg", "jpeg"):
        marked.convert("RGB").save(out, format="JPEG", quality=88)
    elif ext == "webp":
        marked.save(out, format="WEBP", quality=88)
    else:
        marked.save(out, format="PNG")
    return out.getvalue()


# ------------------------------ Entry ------------------------------

def apply_watermark(data: bytes, ext: str, name: Optional[str], email: Optional[str]) -> bytes:
    """Burn "name • email" into `data`. Best-effort: returns `data` untouched for
    formats that cannot carry a mark, or if rendering fails."""
    ext = (ext or "").lower()
    if ext not in WATERMARKABLE_EXTS:
        return data
    text = display_text(name, email)
    try:
        if ext in PDF_EXTS:
            return _watermark_pdf(data, text)
        return _watermark_image(data, text, ext)
    except Exception as e:
        logger.error(f"watermark failed (ext={ext}): {e}")
        return data


def watermarked_media_type(ext: str, fallback: str) -> str:
    """GIFs come back as a still PNG; every other marked format keeps its type."""
    return "image/png" if (ext or "").lower() == "gif" else fallback
