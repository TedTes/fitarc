#!/usr/bin/env python3
"""
Traces the back-view highlight shapes from athlete-back-v7.png itself, using the hand-placed regions in
athlete-back-v7-regions.svg only as guides for *which* muscle sits *where*.

  1. Body silhouette: skin and shorts are far less saturated than the orange glow, so every shape is clipped
     to the real body outline (nothing spills past a leg or arm edge).
  2. Each guide's core (its inner part) seeds a marker; skin far from every guide seeds "no muscle". A
     watershed over a groove map (dark seams + edge strength) then floods the markers, so the border between
     two neighbouring muscles lands on the real groove in the artwork, not on a hand-drawn curve.
  3. Each traced shape may only move BAND px away from its guide, keeping the guide's anatomy.
  4. Group outlines (all of "back", all hamstrings) are traced as one merged shape, so a group highlight has a
     single border instead of one border per part.

Writes src/screens/runtime/backMuscleContours.ts (same exports as build_back_regions.py) and a review image.
Dev-only. Needs numpy, scipy, scikit-image and opencv-python-headless:
    .venv/bin/python scripts/muscle-map/trace_back_v7.py
"""
import json
import os
import re
import cv2
import numpy as np
from scipy import ndimage as ndi
from skimage.segmentation import watershed

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
IMAGE = os.path.join(ROOT, 'assets/images/muscle-map/athlete-back-v7.png')
GUIDES = os.path.join(ROOT, 'assets/images/muscle-map/athlete-back-v7-regions.svg')
OUT = os.path.join(ROOT, 'src/screens/runtime/backMuscleContours.ts')
REVIEW = os.path.join(HERE, 'review', 'back-v7-traced.png')

BAND = 16         # px a traced edge may move from its guide
CORE = 0.45       # fraction of a guide's inner depth used as its sure-inside seed
INSET = 2.0       # px kept between a shape and the body outline
BLEND = 0.65      # weight of the image-snapped edge vs the guide curve
SMOOTH = 3.0      # px smoothing of each traced shape
PART_GAP = 1.0    # px pulled in from neighbouring parts so the real groove shows between them
GROUP_CLOSE = 31  # px gap bridged when merging a group's parts into one outline
HIT_GROW = 12     # px a touch target extends beyond its shape
UP = 4            # vectorisation supersampling
GROUPS = {'back': 'Back', 'hamstrings': 'Hamstrings'}


# --- SVG guides --------------------------------------------------------------------------------------------

def flatten(d, steps=16):
    """Absolute M/L/C/Z path data -> list of polygons."""
    tokens = re.findall(r'[MLCZ]|-?\d+(?:\.\d+)?', d)
    polys, cur, pos, i = [], [], None, 0
    num = lambda: float(tokens[i])
    while i < len(tokens):
        t = tokens[i]
        if t == 'M':
            if cur: polys.append(cur)
            pos = (float(tokens[i + 1]), float(tokens[i + 2])); cur = [pos]; i += 3
        elif t == 'L':
            pos = (float(tokens[i + 1]), float(tokens[i + 2])); cur.append(pos); i += 3
        elif t == 'C':
            p = [pos] + [(float(tokens[i + 1 + 2 * k]), float(tokens[i + 2 + 2 * k])) for k in range(3)]
            for s in range(1, steps + 1):
                u = s / steps
                x = (1 - u) ** 3 * p[0][0] + 3 * (1 - u) ** 2 * u * p[1][0] + 3 * (1 - u) * u ** 2 * p[2][0] + u ** 3 * p[3][0]
                y = (1 - u) ** 3 * p[0][1] + 3 * (1 - u) ** 2 * u * p[1][1] + 3 * (1 - u) * u ** 2 * p[2][1] + u ** 3 * p[3][1]
                cur.append((x, y))
            pos = p[3]; i += 7
        elif t == 'Z':
            if cur: polys.append(cur)
            cur = []; i += 1
        else:
            i += 1
    if cur: polys.append(cur)
    return polys


def read_guides(shape):
    svg = open(GUIDES).read()
    regions = []
    for tag in re.findall(r'<path\b[^>]*>', svg):
        a = dict(re.findall(r'([\w-]+)="([^"]*)"', tag))
        m = np.zeros(shape, np.uint8)
        for poly in flatten(a['d']):
            cv2.fillPoly(m, [np.round(np.array(poly) * 8).astype(np.int32)], 1, shift=3)
        regions.append(dict(part=a['id'], muscle=a['data-muscle'], label=a['data-label'], mask=m.astype(bool),
                            reference=a.get('data-reference-only') == 'true', covered=a.get('data-covered') == 'true'))
    return regions


# --- image -------------------------------------------------------------------------------------------------

def silhouette(im):
    hsv = cv2.cvtColor(im, cv2.COLOR_BGR2HSV)
    body = (hsv[..., 1] < 205) & (hsv[..., 2] > 28)
    body = ndi.binary_opening(body, iterations=2)
    body = ndi.binary_closing(body, iterations=3)
    lab, n = ndi.label(body)
    sizes = ndi.sum(body, lab, range(1, n + 1))
    return ndi.binary_fill_holes(lab == (1 + int(np.argmax(sizes))))


def groove_cost(im):
    g = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)
    g = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8)).apply(g).astype(np.float32)
    dark = cv2.morphologyEx(cv2.GaussianBlur(g, (0, 0), 2.2), cv2.MORPH_BLACKHAT,
                            cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (17, 17)))
    soft = cv2.GaussianBlur(g, (0, 0), 3.0)
    edge = np.hypot(cv2.Sobel(soft, cv2.CV_32F, 1, 0), cv2.Sobel(soft, cv2.CV_32F, 0, 1))
    norm = lambda a: np.clip(a / np.percentile(a, 99), 0, 1)
    return 0.6 * norm(dark) + 0.4 * norm(edge)


def tidy(m, sigma=1.4):
    u = m.astype(np.uint8)
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    u = cv2.morphologyEx(cv2.morphologyEx(u, cv2.MORPH_OPEN, k), cv2.MORPH_CLOSE, k)
    m = ndi.binary_fill_holes(u.astype(bool))
    lab, n = ndi.label(m)
    if n > 1:
        sizes = ndi.sum(m, lab, range(1, n + 1))
        m = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s >= 0.08 * max(sizes) and s > 60])
    return cv2.GaussianBlur(m.astype(np.float32), (0, 0), sigma) > 0.5


# --- vectorise ---------------------------------------------------------------------------------------------

def to_path(mask, epsilon=0.45, level=0.5):
    h, w = mask.shape
    up = cv2.resize(mask.astype(np.float32), (w * UP, h * UP), interpolation=cv2.INTER_LINEAR)
    up = (cv2.GaussianBlur(up, (0, 0), UP * 0.8) > level).astype(np.uint8)
    found, _ = cv2.findContours(up, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    out = []
    for c in found:
        if cv2.contourArea(c) < 40 * UP * UP:
            continue
        a = cv2.approxPolyDP(c, epsilon * UP, True)[:, 0, :].astype(np.float64)
        a = (a + 0.5) / UP
        out.append('M' + 'L'.join(f'{x:.1f} {y:.1f}' for x, y in a) + 'Z')
    return ''.join(out)


def main():
    im = cv2.imread(IMAGE)
    h, w = im.shape[:2]
    regions = read_guides((h, w))
    body = silhouette(im)
    inside = ndi.distance_transform_edt(body) > INSET
    cost = groove_cost(im)

    # Markers: 1 = not a muscle, 2.. = regions.
    markers = np.zeros((h, w), np.int32)
    union = np.zeros((h, w), bool)
    for r in regions:
        union |= r['mask']
    far = ndi.distance_transform_edt(~union) > BAND
    markers[~body | far] = 1
    for k, r in enumerate(regions, 2):
        g = r['mask'] & body
        depth = ndi.distance_transform_edt(g)
        markers[(depth > max(2.5, CORE * depth.max())) & g] = k
    flooded = watershed(cost, markers)

    traced = []
    for k, r in enumerate(regions, 2):
        near = ndi.distance_transform_edt(~r['mask']) <= BAND
        if r['covered']:
            m = r['mask'] & body   # under the shorts there are no muscle edges to snap to
        else:
            m = (flooded == k) & near & inside
            # Blend the snapped edge with the guide's own curve (signed distances), then smooth: the border
            # stays on the groove but loses the jitter that skin texture and veins put into a raw watershed.
            sdf = lambda a: ndi.distance_transform_edt(a) - ndi.distance_transform_edt(~a)
            m = (BLEND * sdf(m) + (1 - BLEND) * sdf(r['mask'] & body)) > 0
            m = cv2.GaussianBlur(m.astype(np.float32), (0, 0), SMOOTH) > 0.5
            m &= inside
        traced.append(tidy(m))
    # Pull every part off its neighbours by PART_GAP so the groove reads as a hairline between shapes.
    owner = np.zeros((h, w), np.int32)
    for k, m in enumerate(traced, 1):
        owner[m] = k
    for k, m in enumerate(traced):
        others = (owner > 0) & (owner != k + 1)
        if others.any():
            traced[k] = m & (ndi.distance_transform_edt(~others) > PART_GAP)

    kept = [(r, m) for r, m in zip(regions, traced) if not r['reference'] and m.any()]
    label = np.zeros((h, w), np.int32)
    for i, (_, m) in enumerate(kept, 1):
        label[m] = i
    dist, (iy, ix) = ndi.distance_transform_edt(label == 0, return_indices=True)
    nearest = label[iy, ix]

    masks, review = [], im.copy()
    palette = [tuple(int(c) for c in cv2.cvtColor(np.uint8([[[int(180 * i / len(kept)), 220, 255]]]), cv2.COLOR_HSV2BGR)[0, 0])
               for i in range(len(kept))]
    overlay = im.copy()
    for i, (r, m) in enumerate(kept, 1):
        hit = ((nearest == i) & (dist <= HIT_GROW)) | m
        entry = dict(muscle=r['muscle'], part=r['part'], label=r['label'], visible=to_path(m), hit=to_path(hit, 1.0))
        if r['covered']:
            entry['covered'] = True
        masks.append(entry)
        overlay[m] = palette[i - 1]
        cv2.drawContours(review, cv2.findContours(m.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)[0], -1, palette[i - 1], 1)
        print(f"  {r['part']}: {int(m.sum())} px")
    groups = []
    for muscle, name in GROUPS.items():
        union_m = np.zeros((h, w), bool)
        for r, m in kept:
            if r['muscle'] == muscle:
                union_m |= m
        # Bridge the hairline gaps between parts and round off the notches where parts meet, so the group reads
        # as one clean shape; it stays clipped to the body.
        merged = cv2.morphologyEx(union_m.astype(np.uint8), cv2.MORPH_CLOSE,
                                  cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (GROUP_CLOSE, GROUP_CLOSE))).astype(bool)
        merged = ndi.binary_fill_holes(merged)
        merged = (cv2.GaussianBlur(merged.astype(np.float32), (0, 0), 4.0) > 0.5) & inside
        groups.append(dict(muscle=muscle, part=muscle, label=name, visible=to_path(merged), hit=to_path(merged, 1.0)))
    os.makedirs(os.path.dirname(REVIEW), exist_ok=True)
    cv2.imwrite(REVIEW, cv2.addWeighted(overlay, 0.42, review, 0.58, 0))

    src = f"""// GENERATED by scripts/muscle-map/trace_back_v7.py. Do not edit by hand.
// Shapes are traced from athlete-back-v7.png itself (body outline + muscle grooves), guided by the regions in
// assets/images/muscle-map/athlete-back-v7-regions.svg. Native {w} × {h} pixels.
// Covered regions (under clothing) indicate location only.
import type {{ MuscleMask }} from './muscleMasks';

export const BACK_MUSCLE_MAP_SIZE = {{ width: {w}, height: {h} }} as const;

export const BACK_MUSCLE_CONTOURS: MuscleMask[] = {json.dumps(masks, indent=2)};

// Whole-group highlights are traced as one merged outline, so a group shows a single border, not one per part.
export const BACK_GROUP_CONTOURS: MuscleMask[] = {json.dumps(groups, indent=2)};
"""
    open(OUT, 'w').write(src)
    print('wrote', OUT, os.path.getsize(OUT), 'bytes; review', REVIEW)


if __name__ == '__main__':
    main()
