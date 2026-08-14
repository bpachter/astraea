"""Stitch the recorded walkthrough frames into a captioned animated GIF.

    python deploy/make-gif.py <framesDir> <out.gif>

Frames come from deploy/record-walkthrough.mjs — real screenshots of the live
deployment, not mockups. Captions are burned in so the animation reads without
sound, narration, or a caption track.
"""

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

WIDTH = 1000  # final GIF width; frames are captured at 1280 and scaled down
BAR = 56  # caption bar height
BG = (13, 17, 23)
FG = (230, 233, 236)
ACCENT = (181, 217, 253)

CAPTIONS = [
    ("start", "One rule: nothing publishes unless it reconciles", 2.5),
    ("atlas", "24,240 entities — genes rise through reactions to metabolites", 3.0),
    ("atlas-node", "Every node carries its real identifiers", 2.5),
    ("lookup", "A versioned .NET lookup API — ASP.NET Core on AWS App Runner", 3.0),
    ("login", "A Django portal running as a container beside it", 2.0),
    ("queue", "Seven proposals await a verdict", 2.0),
    ("verdicts", "Django calls the C# gate — each refusal is named, never 'failed'", 3.5),
    ("refusal", "Approval is impossible without a passing verdict", 3.5),
]


def font(size):
    for candidate in ("segoeui.ttf", "arial.ttf", "DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(candidate, size)
        except OSError:
            continue
    return ImageFont.load_default()


def build(frames_dir: Path, out: Path):
    files = sorted(frames_dir.glob("*.png"))
    if not files:
        sys.exit(f"no frames in {frames_dir}")
    caption_by_key = {key: (text, hold) for key, text, hold in CAPTIONS}

    label_font = font(21)
    step_font = font(14)
    images, durations = [], []

    for index, file in enumerate(files):
        key = file.stem.split("-", 1)[1]
        text, hold = caption_by_key.get(key, (key, 2.0))

        shot = Image.open(file).convert("RGB")
        scale = WIDTH / shot.width
        shot = shot.resize((WIDTH, round(shot.height * scale)), Image.LANCZOS)

        canvas = Image.new("RGB", (WIDTH, shot.height + BAR), BG)
        canvas.paste(shot, (0, 0))
        draw = ImageDraw.Draw(canvas)
        draw.line([(0, shot.height), (WIDTH, shot.height)], fill=(60, 98, 133), width=2)
        draw.text((20, shot.height + BAR // 2), text, font=label_font, fill=FG, anchor="lm")
        draw.text(
            (WIDTH - 20, shot.height + BAR // 2),
            f"{index + 1}/{len(files)}",
            font=step_font,
            fill=ACCENT,
            anchor="rm",
        )

        images.append(canvas.convert("P", palette=Image.ADAPTIVE, colors=192))
        durations.append(int(hold * 1000))

    out.parent.mkdir(parents=True, exist_ok=True)
    images[0].save(
        out,
        save_all=True,
        append_images=images[1:],
        duration=durations,
        loop=0,
        optimize=True,
    )
    size_mb = out.stat().st_size / 1e6
    print(json.dumps({
        "out": str(out),
        "frames": len(images),
        "seconds": sum(durations) / 1000,
        "megabytes": round(size_mb, 2),
    }, indent=1))


if __name__ == "__main__":
    build(Path(sys.argv[1]), Path(sys.argv[2]))
