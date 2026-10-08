#!/usr/bin/env python3
"""
Builds src/screens/runtime/muscleMasks.ts from flat-colour segmentation maps (scripts/muscle-map/maps/*-map.png),
each pixel-aligned with its render (assets/images/muscle-map/athlete-{front,back}-v4.jpg).

Every pixel is assigned to the nearest palette colour (or background); each class is cleaned morphologically,
vectorised from a supersampled mask into a smooth SVG path, and given a touch target that grows HIT_GROW px but
never overlaps a neighbour's. Replaces the guide-and-watershed tracing in trace_masks.py, which only applies to
the older v2 artwork.

Dev-only. Needs numpy, scipy and opencv-python-headless (not app dependencies):
    python3 -m venv .venv && .venv/bin/pip install numpy scipy opencv-python-headless
    .venv/bin/python scripts/muscle-map/from_segmentation.py
"""
import os
import cv2
import numpy as np
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
MAP = os.path.join(HERE, 'maps', 'athlete-%s-v4-map.png')
OUT = os.path.join(ROOT, 'src/screens/runtime/muscleMasks.ts')

MATCH = 75       # max RGB distance from a palette colour (JPEG noise)
MIN_AREA = 120   # px; smaller blobs are compression debris
MIN_SATURATION = 45   # max-min channel spread a muscle pixel must have
HIT_GROW = 10    # px a touch target extends beyond its visible mask
UP = 4           # vectorisation supersampling
EPS = 0.55       # px path simplification tolerance

# (muscle group, part id, label or None, [map colours]).  Colours absent from a list (forearms, tibialis) are
# muscles the runtime doesn't track, so they stay unhighlighted.
PALETTE = {
    'front': [
        ('back', 'upper_traps', 'Upper trapezius', ['#FF00FF']),
        ('chest', 'upper_chest', 'Upper chest (clavicular head)', ['#FF0000']),
        ('chest', 'lower_chest', 'Mid & lower chest (sternal head)', ['#990000']),
        ('delts', 'front_delts', 'Front deltoid', ['#FF8800']),
        ('delts', 'side_delts', 'Side deltoid', ['#FFCC00']),
        ('biceps', 'biceps', None, ['#FFFF00']),
        ('core', 'abs', 'Rectus abdominis (abs)', ['#00CC00']),
        ('core', 'obliques', 'Obliques', ['#668800']),
        ('glutes', 'glute_medius', 'Gluteus medius / TFL', ['#9900FF']),
        ('quads', 'rectus_femoris', 'Rectus femoris (center quad)', ['#0066FF']),
        ('quads', 'vastus_lateralis', 'Vastus lateralis (outer quad)', ['#66CCFF']),
        ('quads', 'vastus_medialis', 'Vastus medialis (inner quad)', ['#000099']),
        ('calves', 'calves', None, ['#00CCCC']),
    ],
    'back': [
        ('back', 'upper_traps', 'Upper trapezius', ['#FF00FF']),
        ('back', 'mid_traps', 'Mid trapezius / rhomboids', ['#FF6699', '#FC5484']),
        ('back', 'lower_traps', 'Lower trapezius', ['#CC0066', '#B40C54']),
        ('back', 'lats', 'Latissimus dorsi', ['#00CC00', '#0CB40C']),
        ('delts', 'rear_delts', 'Rear & side deltoid', ['#FF8800']),
        ('triceps', 'triceps', None, ['#FFFF00']),
        ('glutes', 'glute_max', 'Gluteus maximus', ['#9900FF', '#CC66FF', '#6C0CCC', '#840CCC']),
        ('hamstrings', 'biceps_femoris', 'Biceps femoris (outer hamstring)', ['#0066FF']),
        ('hamstrings', 'medial_hamstrings', 'Semitendinosus / semimembranosus (inner hamstring)', ['#66CCFF']),
        ('calves', 'gastrocnemius', 'Gastrocnemius', ['#00CCCC', '#0CB4CC']),
        ('calves', 'soleus', 'Soleus', ['#006666', '#0C5454']),
    ],
}
# Map colours that are real muscles but untracked; they claim their pixels so nothing bleeds into them.
IGNORED = ['#CC9966', '#888888']


def rgb(hex_):
    return np.array([int(hex_[i:i + 2], 16) for i in (1, 3, 5)], np.float32)


def classify(im, entries):
    colours, owner = [], []
    for i, (_, _, _, hexes) in enumerate(entries):
        for h in hexes:
            colours.append(rgb(h)); owner.append(i)
    for h in IGNORED:
        colours.append(rgb(h)); owner.append(-1)
    colours = np.stack(colours)
    owner = np.array(owner)
    px = im.reshape(-1, 3).astype(np.float32)
    d = np.linalg.norm(px[:, None, :] - colours[None], axis=2)
    best = d.argmin(1)
    label = owner[best]
    label[d[np.arange(len(px)), best] > MATCH] = -1
    # Every palette colour is strongly saturated; dark-grey silhouette and outline pixels are not.
    label[(px.max(1) - px.min(1)) < MIN_SATURATION] = -1
    return label.reshape(im.shape[:2])


def clean(mask):
    mask = cv2.medianBlur(mask.astype(np.uint8) * 255, 5) > 0
    mask = ndi.binary_opening(mask, iterations=1)
    mask = ndi.binary_closing(mask, iterations=2)
    lab, n = ndi.label(mask)
    if n:
        sizes = ndi.sum(mask, lab, range(1, n + 1))
        mask = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s >= MIN_AREA])
    return ndi.binary_fill_holes(mask)


def to_path(mask, eps=EPS):
    h, w = mask.shape
    big = cv2.resize(mask.astype(np.float32), (w * UP, h * UP), interpolation=cv2.INTER_LINEAR)
    big = (cv2.GaussianBlur(big, (0, 0), UP * 0.9) > 0.5).astype(np.uint8)
    contours, _ = cv2.findContours(big, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    parts = []
    for c in contours:
        if cv2.contourArea(c) < MIN_AREA * UP * UP:
            continue
        c = cv2.approxPolyDP(c.astype(np.float32) / UP, eps, True).reshape(-1, 2)
        if len(c) < 3:
            continue
        parts.append('M' + 'L'.join(f'{x:.1f} {y:.1f}' for x, y in c) + 'Z')
    return ''.join(parts)


def build(view):
    im = cv2.imread(MAP % view)[..., ::-1]
    entries = PALETTE[view]
    label = classify(im, entries)
    masks = [clean(label == i) for i in range(len(entries))]
    # Touch targets: grow every mask, give each contested pixel to its nearest mask.
    stack = np.stack(masks)
    dist = np.stack([ndi.distance_transform_edt(~m) for m in stack])
    nearest = dist.argmin(0)
    within = dist.min(0) <= HIT_GROW
    out = []
    for i, (muscle, part, label_, _) in enumerate(entries):
        if not masks[i].any():
            print(f'  ! {view}/{part}: no pixels matched')
            continue
        hit = within & (nearest == i)
        out.append((muscle, part, label_, to_path(masks[i]), to_path(hit, eps=1.2)))
        ys, xs = np.nonzero(masks[i])
        print(f'  {view}/{part}: {int(masks[i].sum())} px, x {xs.min()}-{xs.max()}, y {ys.min()}-{ys.max()}')
    return out, im.shape[1], im.shape[0]


def main():
    views, size = {}, None
    for view in ('front', 'back'):
        views[view], w, h = build(view)
        assert size in (None, (w, h)), 'front and back maps must be the same size'
        size = (w, h)
    lines = [
        '// GENERATED by scripts/muscle-map/from_segmentation.py. Do not edit by hand.',
        "// Paths come from the flat-colour segmentation maps in scripts/muscle-map/maps/, pixel-aligned with",
        f"// assets/images/muscle-map/athlete-{{front,back}}-v4.jpg in that image's own {size[0]} x {size[1]} pixel space.",
        '// `visible` follows the muscle; `hit` is a slightly larger, non-overlapping touch target.',
        "import type { Muscle } from '../../runtime';",
        '',
        f'export const MUSCLE_MAP_SIZE = {{ width: {size[0]}, height: {size[1]} }} as const;',
        "export type MuscleMapView = 'front' | 'back';",
        '// `muscle` is the runtime group (status colours come from it). `part` is the individual muscle; for groups the',
        '// picture does not split it equals `muscle`. `label` names a split part.',
        'export type MuscleMask = { muscle: Muscle; part: string; label?: string; visible: string; hit: string };',
        '',
        'export const MUSCLE_MASKS: Record<MuscleMapView, MuscleMask[]> = {',
    ]
    for view in ('front', 'back'):
        lines.append(f'  {view}: [')
        for muscle, part, label, visible, hit in views[view]:
            lines.append('    {')
            lines.append(f"      muscle: '{muscle}',")
            lines.append(f"      part: '{part}',")
            if label:
                lines.append(f"      label: '{label}',")
            lines.append(f"      visible: '{visible}',")
            lines.append(f"      hit: '{hit}',")
            lines.append('    },')
        lines.append('  ],')
    lines.append('};')
    with open(OUT, 'w') as f:
        f.write('\n'.join(lines) + '\n')
    print('wrote', OUT)


if __name__ == '__main__':
    main()
