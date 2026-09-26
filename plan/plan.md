# Watermarked Materials — Preview & Download

Class materials shared to a batch open in a reliable in-app viewer and carry the receiving
student's name and email burned into the file itself, on screen, on download and on paper.

## Who it's for

Teachers who share original PDFs and images with a batch and need shared files to stay
traceable to the student who received them, and students who need to actually open and keep
those materials on any device.

## What's wrong today

Two separate problems, which is why the watermark looked "missing" in two different places:

1. **Materials were never watermarked at all.** The rotating name/email watermark exists only on
   teacher-authored notes in the note reader. Batch materials are served back exactly as the
   teacher uploaded them, so a downloaded PDF has nothing on it and never did.
2. **The preview is broken.** Materials are handed to the browser's own built-in PDF frame,
   which commonly renders blank inside an embedded page and offers its own save and print
   buttons that bypass the app entirely.

Fixing only the preview would still leave downloads unmarked, so both are addressed together.

## Core features and experience

**The watermark travels with the file, not the page.** For PDFs and images the name and email
are composited into the document itself, server-side, at the moment a student opens or
downloads it. Because it is part of the file, it survives download, re-sharing, printing, and
opening in any other app — unlike an on-screen overlay, which disappears the moment the file
leaves the browser.

**Every student gets their own copy.** The mark carries the name and email of the student who
requested the file, tiled diagonally across each page in the same style as the existing note
watermark: light enough to read the content through, dense enough that cropping it out means
destroying the material.

**Teachers and admins get the clean original.** The watermark identifies the recipient, so it
only applies to students. A teacher opening their own upload sees exactly the file they
uploaded, and can hand out a pristine copy when they mean to.

**Preview that works.** PDFs render page by page inside the app rather than being handed to the
browser's PDF plugin. Multi-page documents get page navigation and a zoom control. Images and
text files preview in the same window. Because the app draws the pages, there is no browser PDF
toolbar offering an unwatermarked save, and the preview shows the same marked copy the download
will produce.

**Download always yields the marked copy.** Students keep the ability to download — the file
they receive is the watermarked one. Word and PowerPoint files cannot be reliably marked, so
they continue to download as-is and do not offer an in-app preview; the upload form tells the
teacher this before they choose that format.

## User flow

**Teacher.** Uploads a file to a batch as they do today. On selecting a Word or PowerPoint
file, a note explains it cannot be watermarked and suggests exporting to PDF. Opening their own
material shows the clean original.

**Student.** Opens Materials, taps a file, and the viewer opens with pages rendering
progressively and their own name and email tiled across each one. They page through or zoom,
and pressing download saves that same marked copy. Printing it puts the mark on the paper.
Word and PowerPoint entries show a download button only, labelled so the absence of a preview
isn't mistaken for a failure.

## UI/UX feel

Consistent with the existing dark, glass-panelled app: the viewer is a large focused overlay
with a slim top bar carrying the filename, page position, zoom and download, and the page
itself on a soft neutral backing so the watermark reads as part of the document rather than
app furniture. Pages fade in as they render, with a skeleton placeholder rather than a spinner,
so a large PDF feels progressive instead of frozen. Failures state plainly what went wrong and
offer a retry, never an endless loader.

## Implementation phases

**Phase 1 — MVP, built now.** Burned-in name/email watermark for PDFs and images, applied for
students and skipped for teachers/admin. Working in-app preview for PDFs, images and text, with
page navigation and zoom. Watermarked downloads. Word/PowerPoint download as-is, with the
upload form and the material row both saying so. Print carries the mark.

**Phase 2 — hardening and traceability.** Flatten watermarked PDF pages so the mark cannot be
lifted out with a PDF editor (see assumptions). Record who previewed and downloaded what, and
when, so a teacher can see the access trail per material. Add a per-download trace code tying a
specific leaked file back to a single download event.

**Phase 3 — reach and convenience.** Server-side conversion of Word/PowerPoint to watermarked
PDF so every format is covered. Teacher-configurable watermark appearance and per-material
view-only mode. Bulk upload, and caching of marked copies so repeat opens are instant.

## Assumptions

- Word and PowerPoint files are left unwatermarked in phase 1 rather than blocked, so existing
  uploads keep working; conversion is deferred to phase 3.
- The watermark is a visible tiled overlay composited into the file. In phase 1 it is a layer
  within the PDF, which a determined user with a PDF editor can strip; phase 2's flattening
  closes that. This is stated plainly because it affects how much the mark can be relied on.
- Marked copies are generated per request rather than stored, so a file always carries the name
  of the person who actually opened it. Phase 3 adds caching if large files feel slow.
- Watermark styling follows the existing note watermark — diagonal, tiled, low-contrast, name
  and email only. No date or trace code in phase 1.
- Students keep their download button; nothing becomes view-only in phase 1.
- Existing materials already uploaded are covered automatically, since the mark is applied on
  access rather than at upload.
- Text files preview as plain text and are not watermarked, since the format cannot carry one;
  they remain downloadable as-is.
- No change to who can see which materials — the existing batch-membership rules stand.
