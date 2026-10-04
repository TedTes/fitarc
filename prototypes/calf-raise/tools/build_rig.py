"""
Builds the sprite sheet for the calf-raise prototype from the back-view athlete artwork: a
static background plate, a translating body sprite (ankle up, carrying the whole calf), and
per foot a rigid shoe-upper piece plus a thin ground-anchored sole piece, each with the app's
own traced calf-muscle path baked in as a highlight. Offline build tool -- not shipped.

Usage: .venv/bin/python tools/build_rig.py
Reads:  ../../assets/images/muscle-map/athlete-back-v2.png, qa/alpha_final.png
Writes: layers/*.png, rig.json
"""
import json
import re

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage
from skimage.restoration import inpaint_biharmonic

from segment import extract_alpha

SRC = "../../assets/images/muscle-map/athlete-back-v2.png"
OUT_DIR = "layers"
W, H = 512, 768

# Traced directly from src/screens/runtime/muscleMasks.ts (back view, "calves"),
# which was itself traced from this same source image -- same 512x768 pixel space,
# so the highlight lines up with the app's own muscle map with no re-tracing.
CALF_PATH_BACK = (
    "M203.1 505.4L201.9 505.4L196.1 508.4L191.9 507.4L189.4 508.9L188.4 510.9L188.4 513.1L187.4 514.9L187.4 518.1"
    "L184.6 520.4L183.4 522.9L183.4 525.1L180.4 531.9L180.4 534.1L178.6 536.4L178.4 538.1L176.4 541.9L176.4 545.1"
    "L175.4 546.9L175.4 550.1L173.4 554.9L173.4 575.1L172.4 576.9L172.4 585.1L173.4 586.9L173.4 590.1L174.4 591.9"
    "L174.4 595.1L175.4 596.9L175.4 613.1L176.4 614.9L176.4 624.1L175.4 625.9L175.4 630.1L177.9 633.9L178.6 636.6"
    "L180.4 638.4L184.9 640.6L192.1 640.6L197.4 637.6L198.6 635.1L198.6 632.9L199.6 631.1L199.6 628.9L201.4 626.6"
    "L201.6 624.9L203.6 621.1L203.6 617.9L206.6 610.1L206.6 600.9L207.6 599.1L207.6 594.9L208.6 593.1L208.6 591.9"
    "L215.4 584.6L219.6 575.1L219.6 564.9L218.6 563.1L218.6 556.9L216.6 553.1L216.6 549.9L214.6 545.1L214.6 534.9"
    "L213.6 533.1L213.6 520.9L217.4 516.6L218.4 514.6L218.4 513.4L216.1 511.4L210.9 511.4L207.9 509.9L205.6 506.6Z"
    "M317.9 504.4L315.4 505.6L310.1 509.9L307.1 511.4L304.9 511.4L303.1 510.4L301.9 510.4L297.9 512.4L296.4 514.9"
    "L296.4 516.1L297.4 517.9L297.4 520.1L298.4 521.9L298.4 534.1L297.4 535.9L297.4 547.1L296.4 548.9L296.4 554.1"
    "L293.4 560.9L293.4 575.1L294.4 576.9L294.4 579.1L297.6 585.6L301.9 589.9L304.4 593.9L304.4 595.1L305.4 596.9"
    "L305.4 609.1L307.4 613.9L307.4 617.1L308.6 619.6L311.4 622.9L311.4 628.1L312.4 629.9L312.4 632.1L314.6 636.6"
    "L317.9 638.6L322.1 638.6L323.9 639.6L330.1 639.6L331.9 638.6L333.1 638.6L334.4 637.6L335.6 635.1L335.6 630.9"
    "L336.6 629.1L336.6 612.9L337.6 611.1L337.6 590.9L338.6 589.1L338.6 584.9L339.6 583.1L339.6 576.9L340.6 575.1"
    "L340.6 573.9L339.6 572.1L339.6 558.9L338.6 557.1L338.6 552.9L337.6 551.1L337.6 547.9L336.6 546.1L336.6 543.9"
    "L335.6 542.1L334.6 537.9L331.6 532.1L331.6 528.9L330.6 527.1L330.6 525.9L326.6 518.1L326.6 512.9L325.6 511.1"
    "L325.6 508.9L323.6 505.6L321.1 504.4Z"
)

# Cut line sits at the narrow ankle "waist" (above the shoe collar), not the knee, so the
# body sprite carries the whole calf. PIVOT_LEFT/RIGHT (the ground contact point under each
# sole) isn't used by any transform -- both body and feet move by plain rigid translation,
# no scale or rotation anywhere -- it's kept only as the anatomical reference LIFT_PX was
# estimated from. See ../NOTES.md for the two earlier rigs this replaced and why.
ANKLE_Y = 648
OVERLAP = 12           # foot mask starts a little above ANKLE_Y so the seam hides under the body layer
SPLIT_X = 256          # left/right foot split (natural gap between the legs below the knee)
PIVOT_LEFT = (181, 723)
PIVOT_RIGHT = (320, 723)
LIFT_PX = 12                 # art-directed rise at peak, for the body
FOOT_LIFT_FRACTION = 0.35    # the foot rises too, but less -- see the comment on `rig` below
HIGHLIGHT_COLOR = (244, 141, 77)  # colors.accent, #F48D4D


def parse_path_to_polygons(d: str) -> list[list[tuple[float, float]]]:
    """The traced path only ever uses M/L/Z (straight segments), so this is a plain polyline parse."""
    tokens = re.findall(r"[MLZ]|-?\d+\.?\d*", d)
    polygons, current = [], []
    i = 0
    while i < len(tokens):
        tok = tokens[i]
        if tok == "M" or tok == "L":
            x, y = float(tokens[i + 1]), float(tokens[i + 2])
            current.append((x, y))
            i += 3
        elif tok == "Z":
            polygons.append(current)
            current = []
            i += 1
        else:
            i += 1
    if current:
        polygons.append(current)
    return polygons


def main():
    im = Image.open(SRC).convert("RGB")
    rgb = np.asarray(im, dtype=np.float32)
    alpha = extract_alpha(rgb, blur_sigma=1.2, grad_threshold=8.0, patch_soles=True).astype(np.float32) / 255.0

    # Bake the calf highlight into a copy of the artwork so it moves with the leg sprites
    # with zero extra runtime alignment logic -- it's just pixels of the sprite.
    polys = parse_path_to_polygons(CALF_PATH_BACK)
    highlight_mask = Image.new("L", (W, H), 0)
    hd = ImageDraw.Draw(highlight_mask)
    for poly in polys:
        hd.polygon(poly, fill=255)
    highlight_mask = highlight_mask.filter(ImageFilter.GaussianBlur(0.6))
    hm = np.asarray(highlight_mask, dtype=np.float32) / 255.0

    highlighted_rgb = rgb.copy()
    fill_strength = 0.45
    color = np.array(HIGHLIGHT_COLOR, dtype=np.float32)
    blend = hm[..., None] * fill_strength
    highlighted_rgb = highlighted_rgb * (1 - blend) + color * blend
    # Thin stroke at the highlight edge (outline), same idea as MuscleMap's "active" style.
    edge = np.asarray(
        Image.fromarray((hm * 255).astype(np.uint8)).filter(ImageFilter.FIND_EDGES)
    , dtype=np.float32) / 255.0
    edge = np.clip(edge * 3.0, 0, 1)
    stroke_blend = edge[..., None] * 0.9
    highlighted_rgb = highlighted_rgb * (1 - stroke_blend) + color * stroke_blend
    highlighted_rgb = np.clip(highlighted_rgb, 0, 255)

    # --- background: inpaint the athlete-shaped hole in the smooth gradient backdrop ---
    body_mask = alpha > 0.5
    body_mask_grown = ndimage.binary_dilation(body_mask, iterations=3)  # swallow the soft rim too
    bg = np.zeros_like(rgb)
    for c in range(3):
        bg[..., c] = inpaint_biharmonic(rgb[..., c] / 255.0, body_mask_grown) * 255.0
    Image.fromarray(np.clip(bg, 0, 255).astype(np.uint8)).save(f"{OUT_DIR}/background.png")

    def save_rgba(rgb_arr, a_arr, box, path):
        x0, y0, x1, y1 = box
        crop_rgb = rgb_arr[y0:y1, x0:x1]
        crop_a = (a_arr[y0:y1, x0:x1] * 255).astype(np.uint8)
        rgba = np.dstack([np.clip(crop_rgb, 0, 255).astype(np.uint8), crop_a])
        Image.fromarray(rgba, mode="RGBA").save(path)
        return [x0, y0, x1, y1]

    # liftPx is how high the body rises at the peak; footLiftFraction is how much of that the
    # foot also rises (less than 1 -- see NOTES.md for the two rigs this replaced: scaling the
    # sole/foot from the ground pivot stretched the sprite's feather-blurred alpha edges along
    # with it, which read as melting; giving the foot the *same* dy as the body had zero
    # relative motion anywhere, which read as the whole figure bouncing rather than a calf
    # raise). Both numbers are art-directed, not derived -- tuned by eye against the rendered
    # result, same as liftPx itself.
    rig = {
        "canvas": [W, H], "ankleY": ANKLE_Y, "splitX": SPLIT_X,
        "liftPx": LIFT_PX, "footLiftFraction": FOOT_LIFT_FRACTION,
    }

    # Body: full width, top of canvas down to just past the ankle -- carries the whole calf.
    box = (0, 0, W, ANKLE_Y + OVERLAP)
    rig["body"] = {"box": save_rgba(highlighted_rgb, alpha, box, f"{OUT_DIR}/body.png")}

    # Each foot: one rigid piece, ankle down to the canvas bottom, split at SPLIT_X.
    for side, x0, x1, pivot in (("left", 130, SPLIT_X, PIVOT_LEFT), ("right", SPLIT_X, 382, PIVOT_RIGHT)):
        foot_box = (x0, ANKLE_Y - OVERLAP, x1, H)
        rig[f"{side}Foot"] = {
            "box": save_rgba(highlighted_rgb, alpha, foot_box, f"{OUT_DIR}/foot_{side}.png"),
            "pivot": list(pivot),
        }

    with open("rig.json", "w") as f:
        json.dump(rig, f, indent=2)
    print("wrote rig.json and layers/*.png")


if __name__ == "__main__":
    main()
