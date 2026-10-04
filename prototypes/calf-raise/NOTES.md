# Calf raise prototype

Tests whether joint-based 2D animation, built from FitArc's existing athlete illustration,
can produce a convincing calf raise without a 3D model. Isolated prototype: nothing here is
wired into the app, and the source artwork is only read, never modified.

## Run it

```
cd prototypes/calf-raise
python3 -m http.server 8000
```

Open `http://localhost:8000/`. Play / pause / replay / speed controls are under the figure.
(A plain `file://` open won't work -- the page `fetch()`s `rig.json`, which browsers block
on the `file://` origin. Any static server is fine, not just Python's.)

`?u=0.5` on the URL freezes the pose at that point in the cycle (0 = rest, 0.5 = peak, 1 =
rest again) instead of playing -- useful for inspecting a specific frame.

## How it's built

- `assets/images/muscle-map/athlete-back-v2.png` is the chosen view. The back view was used
  instead of front because it's the standard reference angle for a calf raise (the
  gastrocnemius is what you're trying to show flexing, and it's only visible from behind),
  and because the shoe's heel/sole is legible from this angle in a way it isn't from the
  front. One view, one repetition, as scoped.
- `tools/segment.py` cuts the athlete out of the background (`extract_alpha`, imported
  straight into `build_rig.py` -- there's no intermediate alpha file to keep in sync). The
  backdrop is a smooth black-to-orange radial glow with no hard-edged color to threshold
  globally (dark corners and black shorts/shoes share the same near-black tone). It
  flood-fills the background from the image border through *locally* similar pixels instead,
  which follows the gradient but stops at the real silhouette edge; the shoe soles needed a
  small hand-fitted ellipse patch on top (grey midsole against grey cast shadow has almost no
  local contrast for the flood fill to catch).
- `tools/build_rig.py` cuts the matted figure into the sprites in `layers/`, bakes in the calf
  highlight, and writes `rig.json`. Re-run it after any change to the constants at the top of
  the file (pivot points, cut line, lift height) or to regenerate from a different source
  image.
- The calf highlight is the **exact path already in the codebase**
  (`src/screens/runtime/muscleMasks.ts`, back view, `calves`), traced from this same artwork
  in the same 512x768 pixel space -- not re-traced by hand. It's baked into the sprite pixels
  at build time (fill + edge stroke, matching `MuscleMap`'s own "active" look), so it moves
  with the leg for free with no separate runtime alignment code.
- `animation.js` is the only place that decides *what moves how much*; `renderer.js` only
  knows how to draw whatever it returns, and `tools/qa_render.py` mirrors the same formulas
  in Python so frames can be rendered and inspected without a browser. See the comments in
  those two files for the per-frame math.

## The rig

Three sprites, composited over a static inpainted background. Every piece moves by plain
rigid vertical translation -- no scaling, no rotation, anywhere -- but **not all by the same
amount**:

- `body.png` -- head down through the ankle, carrying the *entire* calf. Rises by `liftPx`.
- `foot_left.png` / `foot_right.png` -- the whole shoe, ankle to ground, undistorted. Rises by
  `liftPx * footLiftFraction` (0.35) -- noticeably less than the body.

That gap between how far the two move is what reads as the calf/ankle extending, rather than
the figure translating as one block. The small remaining gap under each shoe at peak lift
reveals the already-static floor shadow baked into `background.png`, which is what a raised
heel actually looks like from behind, not a rendering seam. The ground pivot per foot (in
`rig.json`, `leftFoot.pivot`) isn't used by any transform; it's kept only as the anatomical
reference `liftPx` was estimated from (see below), and as what a future, less-constrained rig
(one with real rotation) would key off of.

**This took three attempts to get right, each worth recording -- the failure mode changed
each time, not just the numbers:**

1. *Scale the whole foot from the ground pivot.* Technically "forefoot stays grounded," but
   because the stretch was spread across the whole ~90px sprite, the shoe never visibly
   *moved* -- only its height changed. Read as the leg being elastic.
2. *Split off a thin sole sliver and scale only that.* The shoe (now rigid) finally moved, but
   stretching a *cropped* sprite also stretches its soft, feather-blurred alpha edges (the
   matte in `tools/segment.py` is intentionally soft so composited layers blend) -- at the
   ~50-80% scale factor a 15px sliver needed, that soft edge visibly smeared. Read as the sole
   melting.
3. *Make the foot fully rigid, same `dy` as the body.* No more deformation anywhere, but zero
   relative motion between any two parts of the figure is, by definition, indistinguishable
   from the whole image translating as one block -- it read as the character bouncing, which
   is the literal failure mode the brief named up front. Fixed by giving the foot a smaller,
   but still nonzero and still undeformed, translation than the body.

The throughline: the first two attempts were trying to avoid ever showing a gap under the
foot, by deforming a photo to fake continuous ground contact, which doesn't hold up under
real stretch amounts. The third avoided deformation correctly but accidentally removed the
differential motion that makes this read as a *leg* animation instead of a *bounce*. The
current version keeps both: zero deformation, and real (if modest) relative motion between
body and foot.

## The limitation worth being explicit about

The brief asks for "heels rise, forefoot grounded" as a rotation at the ankle. A true version
of that needs the toe-to-ankle lever arm -- and that lever arm runs mostly *into the screen*
(depth), because a foot points away from a camera looking at the front or back of the body.
This artwork is a single flat illustration with no depth information, so that lever arm isn't
recoverable from it, by construction, regardless of how carefully the figure is masked.

Concretely, this is also why an in-plane rotation of the foot sprite was never used: rotating
the visible shoe around the ground pivot tips it *sideways* (the only axis a 2D rotation has),
which reads as an ankle sprain, not a calf raise. The real motion is a rotation around a
left-right axis, which an orthographic back view projects as a change in vertical extent, not
a sideways tip -- which is *also* why the two scale-based attempts above were a reasonable
thing to try before landing on plain rigid translation.

Given that, `liftPx` (how high the body rises at the peak) and `footLiftFraction` (how much of
that the foot also gets) are both art-directed numbers, not derived from a measured lever arm
-- picked by starting from a rough anatomical estimate (foot length as a fraction of this
figure's apparent height, a plausible ~20° ankle swing projected to a height gain) and then
tuned by eye once rendered, `footLiftFraction` specifically against the "does this still read
as a bounce" question. **What would remove this limitation**: a side (sagittal) reference view
of the same figure, or even just the true foot length and ankle-joint position marked on the
existing art, would supply the missing lever arm and let an actual foot rotation and the
body's rise come from one real kinematic chain, instead of two independently-tuned
translations. Without that, rigid translation (at two different rates) plus a revealed ground
shadow is the honest ceiling for a single back-view illustration -- it shows *that* the heel
lifts clearly, but not the ankle joint itself articulating.

One more thing a flat illustration can't give: as a real heel lifts, you'd see a bit more of
the sole's underside (the tread) as the foot tilts. There's no tread-underside artwork to
reveal, and (per above) no rotation that would expose it anyway, so the shoe here stays
flat-on even as it rises -- correct in silhouette and position, not in the fine shape of the
sole.

## What was checked, live

- Every composited frame across the cycle (`tools/qa_render.py`), including a pixel diff
  between the first and last frame (identical) and tight crops at peak lift (no distortion,
  no seam, and a visible gap between how far the body and the foot moved).
- The actual browser page, headless-screenshotted via the `?u=` seek, confirmed to match the
  Python-rendered frame at the same `u` pixel-for-pixel in composition -- re-confirmed after
  each of the three rig revisions above, not just the first one.
- The play/pause/replay *interaction* (button clicks, the `requestAnimationFrame` time loop,
  pause actually freezing the canvas) was verified with real clicks via Puppeteer against the
  system Chrome, against an earlier revision -- that wiring (in `renderer.js`, separate from
  `animation.js`'s `poseAt`) hasn't changed since. Puppeteer isn't kept in the repo (QA-only,
  not the deliverable); `npm install --no-save puppeteer-core` plus a script pointed at
  `/Applications/Google Chrome.app/.../Google Chrome` reproduces it.
- Not checked: a real mobile browser/device (only desktop Chrome headless at a phone-sized
  viewport), and no one outside this conversation has judged whether the current motion reads
  as convincing -- `liftPx` / `footLiftFraction` were tuned by one person's eye against a
  still-frame crop, not watched at speed by a second viewer.

## Bringing it into FitArc

- `animation.js`'s `poseAt(rig, u)` is dependency-free and would port to the app essentially
  as-is (e.g. driven by `Animated`/Reanimated instead of `requestAnimationFrame`, or even used
  as-is inside a `WebView` for a quick integration).
- The sprites in `layers/` are already in the app's existing 512x768 asset space, so
  `rig.json`'s pivots and boxes line up with `src/screens/runtime/muscleMasks.ts` and
  `athleteArtwork.ts` with no re-measuring.
- Real integration would want the sprites cut by a person (or a proper matting tool) rather
  than the flood-fill in `tools/segment.py`, particularly around the shoe soles, which needed
  a hand-fitted patch here (see above).
- `background.png`'s inpainting only had to beat a smooth gradient. The front view, or any
  future artwork with real ground/floor detail, would need a less naive inpaint.
