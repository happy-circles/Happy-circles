from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

from PIL import Image, ImageDraw


def slugify(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-")


def prepare_avatar(source: Path, target: Path, size: int, radius_ratio: float) -> None:
    image = Image.open(source).convert("RGBA")
    side = min(image.width, image.height)
    left = (image.width - side) // 2
    top = (image.height - side) // 2
    square = image.crop((left, top, left + side, top + side))

    radius = int(side * radius_ratio)
    center = side // 2
    crop_box = (
        max(center - radius, 0),
        max(center - radius, 0),
        min(center + radius, side),
        min(center + radius, side),
    )
    cropped = square.crop(crop_box)
    cropped_side = min(cropped.width, cropped.height)

    mask = Image.new("L", (cropped_side, cropped_side), 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse((0, 0, cropped_side - 1, cropped_side - 1), fill=255)

    cropped = cropped.resize((size, size), Image.Resampling.LANCZOS)
    mask = mask.resize((size, size), Image.Resampling.LANCZOS)
    cropped.putalpha(mask)

    target.parent.mkdir(parents=True, exist_ok=True)
    cropped.save(target, "WEBP", quality=92, method=6)


def main() -> None:
    parser = argparse.ArgumentParser(description="Prepare Happy Circles avatar images for the landing page.")
    parser.add_argument("--input", default="public/avatars/raw", help="Folder with raw PNG/JPG avatar files.")
    parser.add_argument("--output", default="public/avatars", help="Folder for optimized transparent WebP files.")
    parser.add_argument("--map", help="Optional JSON file mapping raw filenames to output names.")
    parser.add_argument("--size", default=720, type=int, help="Output width and height in pixels.")
    parser.add_argument(
        "--radius-ratio",
        default=0.462,
        type=float,
        help="Circle radius as a ratio of the original square image. Use 0.46 for the provided checkerboard assets.",
    )
    args = parser.parse_args()

    input_dir = Path(args.input)
    output_dir = Path(args.output)
    extensions = {".png", ".jpg", ".jpeg", ".webp"}
    name_map: dict[str, str] = {}
    if args.map:
        with Path(args.map).open("r", encoding="utf-8") as handle:
            name_map = json.load(handle)

    sources = sorted(path for path in input_dir.iterdir() if path.suffix.lower() in extensions)

    if not sources:
        raise SystemExit(f"No image files found in {input_dir.resolve()}")

    for source in sources:
        target_name = name_map.get(source.name, source.stem)
        target = output_dir / f"{slugify(target_name)}.webp"
        prepare_avatar(source, target, args.size, args.radius_ratio)
        print(f"{source.name} -> {target}")


if __name__ == "__main__":
    main()
