#!/usr/bin/env python3
"""
Builds the muscle-map masks in src/screens/runtime/muscleMasks.ts from the two athlete images.

Technique (semi-automatic tracing, all in the images' native 512x768 pixel space):
  1. regions.py holds hand-traced GUIDE polygons, placed by eye on 4-8x zoomed crops of the source images.
  2. Each guide is refined with a marker-based watershed on the image's Lab gradient. The guide, eroded by
     BAND px, is the sure-inside marker and everything BAND px outside it is sure-outside, so each boundary can
     only move by +-BAND px, and it snaps to the real edge (skin/rim light, muscle separation, garment hem).
  3. The result is clipped to a colour-derived body silhouette (skin is far less saturated than the orange
     glow), pulled in INSET px so colour never reaches the rim light, and overlaps between neighbouring muscles
     are resolved in favour of the guide the pixel lies deepest inside.
  4. Spurs and pinholes are removed morphologically, then each mask is vectorised (4x smoothed contour +
     Douglas-Peucker) into an SVG path for the visible shape.
  5. A group that the image shows as several muscles (parts.py) is then split: each part's seed polygons are the
     markers of a watershed that floods the group's mask over a groove map (dark, thin seams between muscles
     plus edge strength), so the seams between neighbouring muscles land on the real grooves. Left and right
     pieces stop either side of the spine so a part never merges across it.
  6. Touch targets are derived separately: every pixel within HIT_GROW px of a mask is assigned to its nearest
     mask, so targets are slightly larger than the visible shapes but never overlap each other.

Dev-only. Needs numpy, scipy, scikit-image and opencv-python-headless (not app dependencies):
    python3 -m venv .venv && .venv/bin/pip install numpy scipy scikit-image opencv-python-headless
    .venv/bin/python scripts/muscle-map/trace_masks.py
"""
import os
import sys
import cv2
import numpy as np
from scipy import ndimage as ndi
from skimage.segmentation import watershed

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from regions import GUIDES  # noqa: E402
from parts import PARTS  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
IMAGE = os.path.join(ROOT, 'assets/images/muscle-map/athlete-%s-v2.png')
OUT = os.path.join(ROOT, 'src/screens/runtime/muscleMasks.ts')
W, H = 512, 768
BAND = 5        # px a snapped boundary may move either side of its guide
INSET = 1.6     # px kept between a mask and the body edge
HIT_GROW = 8    # px a touch target extends beyond its visible mask
UP = 4          # vectorisation supersampling
PART_GAP = 1.2   # px each part is pulled in from its neighbours, so the real grooves show between parts
SPINE_L, SPINE_R = 254, 257   # left parts stop at SPINE_L, right parts start at SPINE_R (the spine line stays a gap)


def raster(poly):
    m = np.zeros((H, W), np.uint8)
    cv2.fillPoly(m, [np.round(np.array(poly, np.float32)).astype(np.int32)], 1)
    return m.astype(bool)


def gradient_image(im):
    lab = cv2.cvtColor(im, cv2.COLOR_BGR2LAB).astype(np.float32)
    g = np.zeros((H, W), np.float32)
    for c in range(3):
        ch = cv2.GaussianBlur(lab[..., c], (0, 0), 1.1)
        g += np.hypot(cv2.Sobel(ch, cv2.CV_32F, 1, 0), cv2.Sobel(ch, cv2.CV_32F, 0, 1)) * (1.0 if c == 0 else 0.7)
    g = (255 * np.clip(g / np.percentile(g, 99.5), 0, 1)).astype(np.uint8)
    return cv2.cvtColor(g, cv2.COLOR_GRAY2BGR)


def silhouette(im):
    hsv = cv2.cvtColor(im, cv2.COLOR_BGR2HSV)
    body = (hsv[..., 1].astype(int) < 165) & (hsv[..., 2].astype(int) > 22)
    body = ndi.binary_closing(body, structure=np.ones((3, 3)), iterations=3)
    lab, n = ndi.label(body)
    sizes = ndi.sum(body, lab, range(1, n + 1))
    return ndi.binary_fill_holes(lab == (1 + int(np.argmax(sizes))))


def snap(poly, grad):
    P = raster(poly)
    d_in, d_out = ndi.distance_transform_edt(P), ndi.distance_transform_edt(~P)
    markers = np.zeros((H, W), np.int32)
    markers[d_in > BAND] = 1
    markers[d_out > BAND] = 2
    cv2.watershed(grad, markers)
    return markers == 1


def largest(m):
    lab, n = ndi.label(m)
    if n <= 1:
        return m
    sizes = ndi.sum(m, lab, range(1, n + 1))
    return lab == (1 + int(np.argmax(sizes)))


def smooth(m, sigma):
    return cv2.GaussianBlur(m.astype(np.float32), (0, 0), sigma) > 0.5


def tidy(m):
    u = m.astype(np.uint8)
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    u = cv2.morphologyEx(cv2.morphologyEx(u, cv2.MORPH_OPEN, k), cv2.MORPH_CLOSE, k)
    return smooth(ndi.binary_fill_holes(u.astype(bool)), 1.6)


def trace_view(view):
    im = cv2.imread(IMAGE % view)
    grad, sil = gradient_image(im), silhouette(im)
    inside = ndi.distance_transform_edt(sil) > INSET
    pieces = []
    for muscle, polys in GUIDES[view].items():
        for poly in polys:
            pieces.append([muscle, largest(tidy(snap(poly, grad) & inside)) & inside, raster(poly)])
    depth = [ndi.distance_transform_edt(p[2]) for p in pieces]
    stack = np.stack([np.where(p[1], d, -1) for p, d in zip(pieces, depth)])
    owner, claimed = np.argmax(stack, axis=0), (stack >= 0).any(axis=0)
    for k, p in enumerate(pieces):
        p[1] = largest(tidy((owner == k) & claimed & p[1])) & inside
    return pieces


def groove_cost(view):
    """Topography for the part watershed: thin dark seams (black-hat) and edge strength, both high on a seam."""
    g = cv2.cvtColor(cv2.imread(IMAGE % view), cv2.COLOR_BGR2GRAY).astype(np.float32)
    dark = cv2.morphologyEx(cv2.GaussianBlur(g, (0, 0), 0.9), cv2.MORPH_BLACKHAT,
                            cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11)))
    soft = cv2.GaussianBlur(g, (0, 0), 1.3)
    edge = np.hypot(cv2.Sobel(soft, cv2.CV_32F, 1, 0), cv2.Sobel(soft, cv2.CV_32F, 0, 1))
    norm = lambda a: np.clip(a / np.percentile(a, 99), 0, 1)
    return 0.65 * norm(dark) + 0.35 * norm(edge)


def split_group(view, group, domain):
    """Splits a group's mask into its parts. Returns {part_id: mask} (left and right pieces merged per part)."""
    spec = PARTS[view][group]
    markers = np.zeros((H, W), np.int32)
    labels = {}
    for i, (part, info) in enumerate(spec.items(), 1):
        for side, poly in enumerate(info['pieces']):
            core = ndi.distance_transform_edt(raster(poly) & domain) > 1.5
            labels[i * 10 + side + 1] = (part, side)
            markers[core] = i * 10 + side + 1
    flooded = watershed(groove_cost(view), markers, mask=domain)
    columns = np.arange(W)[None, :]
    parts = {part: np.zeros((H, W), bool) for part in spec}
    for label, (part, side) in labels.items():
        piece = (flooded == label) & ((columns <= SPINE_L) if side == 0 else (columns >= SPINE_R))
        parts[part] |= piece
    return {part: ndi.distance_transform_edt(mask) > PART_GAP for part, mask in parts.items()}


def contours(mask, epsilon, level):
    """Smoothed, simplified outlines of a mask as lists of (x, y) in image pixels.

    `level` above 0.5 pulls the outline slightly inward, leaving a hairline gap between neighbouring shapes."""
    up = cv2.resize(mask.astype(np.float32), (W * UP, H * UP), interpolation=cv2.INTER_LINEAR)
    up = (cv2.GaussianBlur(up, (0, 0), UP * 0.7) > level).astype(np.uint8)
    found, _ = cv2.findContours(up, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    rings = []
    for c in found:
        if cv2.contourArea(c) < 6 * UP * UP:
            continue
        a = cv2.approxPolyDP(c, epsilon * UP, True)[:, 0, :].astype(np.float64)
        rings.append((a + 0.5) / UP)
    return rings


def to_path(rings):
    parts = []
    for r in rings:
        pts = [f'{x:.1f} {y:.1f}' for x, y in r]
        parts.append('M' + 'L'.join(pts) + 'Z')
    return ''.join(parts)


def build_view(view):
    pieces = trace_view(view)
    order = list(GUIDES[view].keys())
    merged = {m: np.zeros((H, W), bool) for m in order}
    for muscle, mask, _ in pieces:
        merged[muscle] |= mask
    # (muscle group, part id, label or None, mask) in drawing order; a split group is replaced by its parts
    items = []
    for muscle in order:
        if muscle in PARTS.get(view, {}):
            for part, mask in split_group(view, muscle, merged[muscle]).items():
                items.append((muscle, part, PARTS[view][muscle][part]['label'], mask))
        else:
            items.append((muscle, muscle, None, merged[muscle]))
    anymask = np.zeros((H, W), bool)
    label = np.zeros((H, W), np.int32)
    for i, (_, _, _, mask) in enumerate(items, 1):
        anymask |= mask
        label[mask] = i
    dist, (iy, ix) = ndi.distance_transform_edt(~anymask, return_indices=True)
    nearest = label[iy, ix]
    entries = []
    for i, (muscle, part, name, mask) in enumerate(items, 1):
        hit = ((nearest == i) & (dist <= HIT_GROW)) | (label == i)
        entries.append({
            'muscle': muscle, 'part': part, 'label': name,
            'visible': to_path(contours(mask, 0.35, 0.62)),
            'hit': to_path(contours(smooth(hit, 1.5), 0.8, 0.68)),
        })
    return entries


def main():
    out = [
        '// GENERATED by scripts/muscle-map/trace_masks.py. Do not edit by hand.',
        '// Paths are traced from assets/images/muscle-map/athlete-{front,back}-v2.png in that image\'s own',
        '// 512 x 768 pixel space. `visible` follows the muscle; `hit` is a slightly larger, non-overlapping touch target.',
        "import type { Muscle } from '../../runtime';",
        '',
        'export const MUSCLE_MAP_SIZE = { width: 512, height: 768 } as const;',
        "export type MuscleMapView = 'front' | 'back';",
        '// `muscle` is the runtime group (status colours come from it). `part` is the individual muscle; for groups the',
        '// picture does not split it equals `muscle`. `label` names a split part.',
        'export type MuscleMask = { muscle: Muscle; part: string; label?: string; visible: string; hit: string };',
        '',
        'export const MUSCLE_MASKS: Record<MuscleMapView, MuscleMask[]> = {',
    ]
    for view in ('front', 'back'):
        out.append(f'  {view}: [')
        for e in build_view(view):
            out.append('    {')
            out.append(f"      muscle: '{e['muscle']}',")
            out.append(f"      part: '{e['part']}',")
            if e['label']:
                out.append(f"      label: '{e['label']}',")
            out.append(f"      visible: '{e['visible']}',")
            out.append(f"      hit: '{e['hit']}',")
            out.append('    },')
        out.append('  ],')
    out.append('};')
    with open(OUT, 'w') as f:
        f.write('\n'.join(out) + '\n')
    print('wrote', OUT, os.path.getsize(OUT), 'bytes')


if __name__ == '__main__':
    main()
