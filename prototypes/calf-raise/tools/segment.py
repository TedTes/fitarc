"""
One-off silhouette extraction for the calf-raise prototype.

The source art (assets/images/muscle-map/athlete-back-v2.png) has a smooth
black-to-orange radial glow behind the athlete, with no hard-edged background
color we can threshold globally (dark corners and black shorts/shoes share the
same near-black, low-saturation tone). Instead we flood-fill the background
from the image border through *locally* similar pixels (small step-to-step
color deltas), which correctly follows the smooth gradient but stops at the
athlete's silhouette edge wherever a real local contrast jump exists.

The shoe soles need one extra step: the grey midsole against the grey cast shadow beneath it
has almost no local contrast, so the flood fill alone clips them short. A small hand-fitted
ellipse per sole (measured against the source image) is unioned in before the final
largest-component pass picks up.

Output: alpha.png, a soft matte (0 = background, 255 = athlete), next to this
script's --out path. Not wired into the app; inspection/QA only.
"""
import argparse
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

# Hand-fitted against athlete-back-v2.png; see NOTES.md.
SOLE_PATCH_ELLIPSES = [(150, 700, 211, 727), (283, 700, 357, 727)]


def largest_component(mask: np.ndarray) -> np.ndarray:
    labels, n = ndimage.label(mask, structure=np.ones((3, 3)))
    if n == 0:
        return mask
    sizes = ndimage.sum(np.ones_like(labels), labels, index=range(1, n + 1))
    biggest = 1 + int(np.argmax(sizes))
    return labels == biggest


def extract_alpha(rgb: np.ndarray, blur_sigma: float, grad_threshold: float, patch_soles: bool) -> np.ndarray:
    blurred = ndimage.gaussian_filter(rgb, sigma=(blur_sigma, blur_sigma, 0))
    gx = np.diff(blurred, axis=1, append=blurred[:, -1:, :])
    gy = np.diff(blurred, axis=0, append=blurred[-1:, :, :])
    grad_mag = np.sqrt((gx ** 2).sum(axis=2) + (gy ** 2).sum(axis=2))

    low_grad = grad_mag < grad_threshold
    labels, _ = ndimage.label(low_grad, structure=np.ones((3, 3)))

    border_labels = set(labels[0, :]) | set(labels[-1, :]) | set(labels[:, 0]) | set(labels[:, -1])
    border_labels.discard(0)

    background = np.isin(labels, list(border_labels))
    foreground = ~background
    foreground = largest_component(foreground)

    if patch_soles:
        h, w = foreground.shape
        patch_img = Image.new("L", (w, h), 0)
        d = ImageDraw.Draw(patch_img)
        for box in SOLE_PATCH_ELLIPSES:
            d.ellipse(box, fill=255)
        foreground = foreground | (np.asarray(patch_img) > 127)

    # Close small internal holes (e.g. a bright highlight briefly matching background),
    # then feather the edge so composited layers blend instead of showing a hard cutout.
    foreground = ndimage.binary_closing(foreground, structure=np.ones((5, 5)), iterations=2)
    foreground = ndimage.binary_fill_holes(foreground)
    foreground = largest_component(foreground)  # re-pick in case closing merged noise back in
    alpha = foreground.astype(np.float32)
    alpha = ndimage.gaussian_filter(alpha, sigma=1.0)
    return np.clip(alpha * 255, 0, 255).astype(np.uint8)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("src")
    parser.add_argument("--out", default="alpha.png")
    parser.add_argument("--blur", type=float, default=1.2)
    parser.add_argument("--threshold", type=float, default=8.0)
    parser.add_argument("--no-sole-patch", action="store_true")
    parser.add_argument("--preview", default=None, help="optional RGBA cutout preview path")
    args = parser.parse_args()

    im = Image.open(args.src).convert("RGB")
    rgb = np.asarray(im, dtype=np.float32)
    alpha = extract_alpha(rgb, args.blur, args.threshold, not args.no_sole_patch)
    Image.fromarray(alpha, mode="L").save(args.out)
    print("wrote", args.out, "fg_fraction=", round((alpha > 127).mean(), 4))

    if args.preview:
        rgba = np.dstack([np.asarray(im, dtype=np.uint8), alpha])
        Image.fromarray(rgba, mode="RGBA").save(args.preview)
        print("wrote", args.preview)


if __name__ == "__main__":
    main()
