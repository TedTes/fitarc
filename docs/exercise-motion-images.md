# Exercise motion images — batch 1 (dumbbell)

Short looping previews for the exercise detail sheet. Each exercise is 2–3 still frames of the **same athlete
used by the muscle map**, crossfaded in the app (start → end → start). Batch 1 is the six dumbbell exercises;
the rest of the catalog follows once this batch looks right in the app.

## What you'll need

- The base athlete render: `assets/images/muscle-map/athlete-front-v4.jpg` (attach it to every prompt).
- An image tool that edits from a reference image (Nano Banana works well for this).

## Rules for every frame

1. **Same athlete, same lighting.** Black background, orange rim glow, black shorts, black trainers — as in
   the muscle-map artwork. No text, logos, mirrors, gym walls or other people.
2. **Equipment is plain:** matte black dumbbells with dark grey ends; a plain black padded bench. No brands.
3. **Camera does not move between frames of one exercise.** Same framing, same distance, same angle. Only the
   athlete's limbs move. The bench (if any) stays in exactly the same spot.
4. **Square canvas, 1536 × 1536** (or the largest square the tool offers). Full body plus equipment in frame
   with a little margin; nothing cropped at the edges.
5. **No motion blur, no arrows, no ghosting.** Clean, sharp still poses.

Tip: make frame 1, then make every other frame of that exercise *by editing frame 1* ("same image, but …").
That's what keeps the camera, bench and lighting identical.

## Prompts

Paste the shared prefix, then the exercise line.

**Shared prefix (every prompt):**
> Using the attached athlete as the person, create a photorealistic full-body image on a pure black background
> with the same warm orange rim lighting. Same face, physique, black shorts and black trainers. Square image.
> No text, no logos, no gym environment, no motion blur.

| File | Camera | Frame prompt |
|---|---|---|
| `goblet-squat-1.jpg` | front, 3/4 view, waist height | Standing tall, feet shoulder-width, holding one black dumbbell vertically against the chest with both hands. |
| `goblet-squat-2.jpg` | same | *Edit frame 1:* same image, but in the bottom of a deep squat — thighs parallel to the floor, chest upright, elbows inside the knees, heels flat. |
| `neutral-grip-floor-press-1.jpg` | side view, low | Lying on his back on the floor, knees bent, feet flat, a dumbbell in each hand pressed straight up over the chest, palms facing each other. |
| `neutral-grip-floor-press-2.jpg` | same | *Edit frame 1:* same image, but dumbbells lowered to the chest, upper arms resting on the floor, palms still facing each other. |
| `lateral-raise-1.jpg` | front view | Standing, a dumbbell in each hand at his sides, slight bend in the elbows. |
| `lateral-raise-2.jpg` | same | *Edit frame 1:* same image, but arms raised out to the sides to shoulder height, forming a T, elbows slightly bent. |
| `dumbbell-curl-1.jpg` | front, 3/4 view | Standing, a dumbbell in each hand, arms straight down, palms facing forward. |
| `dumbbell-curl-2.jpg` | same | *Edit frame 1:* same image, but both elbows fully bent, dumbbells curled up to the shoulders, elbows staying at his sides. |
| `incline-db-press-1.jpg` | side view | Lying back on a plain black bench inclined to about 30°, dumbbells pressed up above the upper chest, arms straight. |
| `incline-db-press-2.jpg` | same | *Edit frame 1:* same image, but dumbbells lowered to the sides of the upper chest, elbows below the bench line. Bench unchanged. |
| `chest-supported-row-1.jpg` | side view | Lying face-down on a plain black bench inclined to about 30°, chest on the pad, arms hanging straight down holding a dumbbell in each hand. |
| `chest-supported-row-2.jpg` | same | *Edit frame 1:* same image, but dumbbells rowed up to the lower ribs, elbows pulled back past the torso. Bench unchanged. |

Twelve images total. A third frame (a mid-point) is optional — two frames already loop cleanly.

## Check before uploading

Flip between frame 1 and frame 2 of each exercise. If the bench, dumbbells' size, the athlete's face or the
camera shifts, regenerate frame 2 from frame 1 again. Small hand/foot differences are fine.

## Where to put them

`assets/images/exercise-motion/<file name from the table>` — then tell me and I'll build the looping preview
into the exercise sheet (motion on top, the muscle map below it).
