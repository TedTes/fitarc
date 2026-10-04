/**
 * Pure animation math for the calf-raise rig -- no DOM, no canvas, no asset loading.
 * Given the static rig geometry (rig.json) and a normalized time u in [0,1] (one full
 * rep: rest -> peak -> rest), returns the transform for each layer. renderer.js (browser)
 * and tools/qa_render.py (offline QA) both drive their drawing from these same numbers,
 * so "what moves how much" lives in exactly one place.
 */

// Smooth single-rep ease: 0 -> 1 -> 0, zero velocity at both ends and at the peak.
export function liftPhase(u) {
  return Math.sin(Math.PI * Math.max(0, Math.min(1, u)));
}

/**
 * @param {object} rig - parsed rig.json
 * @param {number} u - normalized time, 0..1
 * @returns {{
 *   body: {dx: number, dy: number},
 *   leftFoot: {dx: number, dy: number},
 *   rightFoot: {dx: number, dy: number},
 * }}
 */
export function poseAt(rig, u) {
  const phase = liftPhase(u);
  const bodyDy = -rig.liftPx * phase;
  // The foot rises too (a real shoe does lift as the heel comes up), but by less than the
  // body -- that gap between how far the two move is what reads as "the calf stretching /
  // the ankle flexing" rather than the whole figure translating as one block. Giving the
  // foot the *same* dy as the body (an earlier revision) has zero relative motion anywhere,
  // which is indistinguishable from a plain whole-image bounce no matter how many sprites
  // it's split across. See NOTES.md for why this is a fraction of liftPx rather than a
  // scale/stretch: that was tried first and visibly warped the sprite's feathered edges.
  const footDy = bodyDy * rig.footLiftFraction;
  return {
    body: { dx: 0, dy: bodyDy },
    leftFoot: { dx: 0, dy: footDy },
    rightFoot: { dx: 0, dy: footDy },
  };
}
