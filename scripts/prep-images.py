#!/usr/bin/env python
"""
Prepare photography for the app.

Drop the originals -- whatever size they come off the Well Windsor site --
into .scratch/raw-images/ (gitignored, so multi-megabyte originals never
reach the repo). This writes optimised copies into public/images/, which
is what the app actually serves.

    python scripts/prep-images.py

Each source produces two files at each needed width:

    <name>-<width>.webp   modern browsers, roughly 30% smaller
    <name>-<width>.jpg    fallback

Widths are capped at the source width -- nothing is ever upscaled, because
enlarging a photo just makes a bigger blurry file.

Why this matters: volunteers browse on phones, often on mobile data. A
single unoptimised Squarespace export can be 3-5 MB, which is larger than
the entire JavaScript bundle.
"""

import sys
import os

sys.stdout.reconfigure(encoding="utf-8")

try:
    from PIL import Image, ImageOps
except ImportError:
    print("Pillow is not installed.  pip install pillow")
    sys.exit(1)

SRC = os.path.join(".scratch", "raw-images")
DST = os.path.join("public", "images")

# Hero art needs to cover a wide viewport; cards never render above ~700px
# even on a 4K screen, so shipping a 2000px file for one is wasted bytes.
WIDTHS = [480, 800, 1280, 1920]

JPEG_QUALITY = 82
WEBP_QUALITY = 80

EXTS = {".jpg", ".jpeg", ".png", ".webp", ".avif", ".tif", ".tiff"}


def slugify(name):
    keep = []
    for ch in name.lower():
        if ch.isalnum():
            keep.append(ch)
        elif ch in " _-":
            keep.append("-")
    slug = "".join(keep)
    while "--" in slug:
        slug = slug.replace("--", "-")
    return slug.strip("-") or "image"


def human(n):
    for unit in ["B", "KB", "MB"]:
        if n < 1024:
            return "%.0f %s" % (n, unit)
        n /= 1024.0
    return "%.1f GB" % n


def main():
    if not os.path.isdir(SRC):
        print("No %s -- create it and drop the originals in." % SRC)
        return 1

    # Walk subdirectories too -- dragging a whole exported folder in is the
    # normal case, and only reading the top level silently skips most of it.
    sources = []
    for root, dirs, files in os.walk(SRC):
        dirs.sort()
        for f in sorted(files):
            if os.path.splitext(f)[1].lower() in EXTS:
                sources.append(os.path.relpath(os.path.join(root, f), SRC))

    if not sources:
        print("Nothing to do: %s is empty." % SRC)
        print("Drop the images in there and run this again.")
        return 0

    os.makedirs(DST, exist_ok=True)
    total_in = total_out = 0

    seen = {}
    for fname in sources:
        path = os.path.join(SRC, fname)
        # Name from the file alone, not its folder, but disambiguate if two
        # folders hold the same filename -- otherwise one silently overwrites
        # the other and you lose an image without being told.
        stem = slugify(os.path.splitext(os.path.basename(fname))[0])
        if stem in seen:
            seen[stem] += 1
            stem = "%s-%d" % (stem, seen[stem])
            print("   (duplicate name, saving as %s)" % stem)
        else:
            seen[stem] = 1
        size_in = os.path.getsize(path)
        total_in += size_in

        with Image.open(path) as im:
            # Honour the EXIF orientation flag, or portrait photos taken on a
            # phone come out sideways.
            im = ImageOps.exif_transpose(im)
            if im.mode in ("RGBA", "LA", "P"):
                background = Image.new("RGB", im.size, (255, 255, 255))
                converted = im.convert("RGBA")
                background.paste(converted, mask=converted.split()[-1])
                im = background
            else:
                im = im.convert("RGB")

            src_w, src_h = im.size
            widths = [w for w in WIDTHS if w <= src_w] or [src_w]

            print("\n%s  (%d x %d, %s)" % (fname, src_w, src_h, human(size_in)))

            for w in widths:
                h = round(src_h * (w / float(src_w)))
                resized = im.resize((w, h), Image.LANCZOS)

                for ext, kwargs in (
                    (".webp", dict(format="WEBP", quality=WEBP_QUALITY, method=6)),
                    (".jpg", dict(format="JPEG", quality=JPEG_QUALITY,
                                  optimize=True, progressive=True)),
                ):
                    out = os.path.join(DST, "%s-%d%s" % (stem, w, ext))
                    resized.save(out, **kwargs)
                    size_out = os.path.getsize(out)
                    total_out += size_out
                    print("   %-40s %s" % (os.path.basename(out), human(size_out)))

    print("\n%d source image(s): %s in, %s out across all sizes."
          % (len(sources), human(total_in), human(total_out)))
    print("Reference them from the app as /images/<name>-<width>.webp")
    return 0


if __name__ == "__main__":
    sys.exit(main())
