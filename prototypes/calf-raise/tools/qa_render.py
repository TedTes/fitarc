"""
Offline QA renderer: composites sample frames of the calf-raise rig to PNG so they can be
inspected directly (seams, gaps, stretch artifacts) without a browser. Mirrors the transform
math in ../animation.js -- see that file's docstring for why the numbers are split out this
way. Not part of the shipped preview; a build/QA tool only.
"""
import json
import math
import os
import sys

from PIL import Image

LAYERS = "layers"


def lift_phase(u: float) -> float:
    return math.sin(math.pi * max(0.0, min(1.0, u)))


def pose_at(rig: dict, u: float) -> dict:
    phase = lift_phase(u)
    body_dy = -rig["liftPx"] * phase
    foot_dy = body_dy * rig["footLiftFraction"]
    return {
        "body": {"dx": 0, "dy": body_dy},
        "leftFoot": {"dx": 0, "dy": foot_dy},
        "rightFoot": {"dx": 0, "dy": foot_dy},
    }


def paste_translated(canvas: Image.Image, sprite: Image.Image, box, dx, dy):
    x0, y0, _, _ = box
    canvas.alpha_composite(sprite, (round(x0 + dx), round(y0 + dy)))


def render_frame(rig, background, body, foot_left, foot_right, u):
    canvas = Image.new("RGBA", tuple(rig["canvas"]), (0, 0, 0, 0))
    canvas.alpha_composite(background.convert("RGBA"))
    pose = pose_at(rig, u)
    paste_translated(canvas, foot_left, rig["leftFoot"]["box"], pose["leftFoot"]["dx"], pose["leftFoot"]["dy"])
    paste_translated(canvas, foot_right, rig["rightFoot"]["box"], pose["rightFoot"]["dx"], pose["rightFoot"]["dy"])
    paste_translated(canvas, body, rig["body"]["box"], pose["body"]["dx"], pose["body"]["dy"])
    return canvas


def main():
    with open("rig.json") as f:
        rig = json.load(f)
    background = Image.open(f"{LAYERS}/background.png")
    body = Image.open(f"{LAYERS}/body.png")
    foot_left = Image.open(f"{LAYERS}/foot_left.png")
    foot_right = Image.open(f"{LAYERS}/foot_right.png")

    os.makedirs("qa", exist_ok=True)
    us = [float(x) for x in sys.argv[1:]] or [0, 0.25, 0.5, 0.75, 1.0]
    for u in us:
        frame = render_frame(rig, background, body, foot_left, foot_right, u)
        out = f"qa/frame_u{u:.2f}.png"
        frame.convert("RGB").save(out)
        print("wrote", out)


if __name__ == "__main__":
    main()
