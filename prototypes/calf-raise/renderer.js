// Rendering only: loads the rig + sprites, draws one frame to a canvas, and runs a small
// play/pause/replay/speed-controlled time loop. All the "what moves how much" math lives in
// animation.js (poseAt) -- this file only knows how to draw whatever that returns.
import { poseAt } from './animation.js';

const REP_SECONDS = 3.6; // one slow rest -> peak -> rest cycle at 1x speed

async function loadImage(src) {
  const img = new Image();
  img.src = src;
  await img.decode();
  return img;
}

function drawTranslated(ctx, sprite, box, dx, dy) {
  const [x0, y0, x1, y1] = box;
  ctx.drawImage(sprite, x0 + dx, y0 + dy, x1 - x0, y1 - y0);
}

export async function createPreview(canvas) {
  const [rig, background, body, footLeft, footRight] = await Promise.all([
    fetch('rig.json').then((r) => r.json()),
    loadImage('layers/background.png'),
    loadImage('layers/body.png'),
    loadImage('layers/foot_left.png'),
    loadImage('layers/foot_right.png'),
  ]);

  canvas.width = rig.canvas[0];
  canvas.height = rig.canvas[1];
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';

  function render(u) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(background, 0, 0);
    const pose = poseAt(rig, u);
    drawTranslated(ctx, footLeft, rig.leftFoot.box, pose.leftFoot.dx, pose.leftFoot.dy);
    drawTranslated(ctx, footRight, rig.rightFoot.box, pose.rightFoot.dx, pose.rightFoot.dy);
    drawTranslated(ctx, body, rig.body.box, pose.body.dx, pose.body.dy);
  }

  let playing = false;
  let speed = 1;
  let elapsed = 0; // seconds into the current rep
  let lastTs = null;

  function frame(ts) {
    if (lastTs === null) lastTs = ts;
    const dt = (ts - lastTs) / 1000;
    lastTs = ts;
    if (playing) {
      elapsed += dt * speed;
      const period = REP_SECONDS;
      if (elapsed >= period) elapsed -= period; // loop: rest -> peak -> rest, repeat
    }
    render(Math.min(1, elapsed / REP_SECONDS));
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  render(0);

  return {
    play() { playing = true; },
    pause() { playing = false; },
    replay() { elapsed = 0; playing = true; },
    setSpeed(s) { speed = s; },
    isPlaying: () => playing,
    // Scrub directly to a pose without the time loop -- used by the ?u= debug param below,
    // also handy for QA (freezing on an exact frame to inspect).
    seek(u) { playing = false; elapsed = u * REP_SECONDS; render(u); },
  };
}
