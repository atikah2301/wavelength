// The dial is a semicircle measured from 0 (far left) to 100 (far right).
// Each band is the half-width either side of the target that earns its points.
export const BANDS = [
  { points: 2, half: 10.5 },
  { points: 3, half: 6.5 },
  { points: 4, half: 2.5 },
];

const MAX_HALF = BANDS[0].half;

/** A random target, kept far enough from the edges that every band fits on the dial. */
export function randomTarget() {
  const span = 100 - 2 * MAX_HALF;
  return Math.round((MAX_HALF + Math.random() * span) * 10) / 10;
}

/** Points for a guess: 4 / 3 / 2 by closeness, 0 for a miss. */
export function scoreFor(guess, target) {
  const distance = Math.abs(guess - target);
  let points = 0;
  for (const band of BANDS) {
    if (distance <= band.half) points = Math.max(points, band.points);
  }
  return points;
}

/** Whether the other team's "target is left/right of the needle" call was right. */
export function directionCorrect(guess, target, call) {
  if (call !== "left" && call !== "right") return false;
  if (target === guess) return false;
  return call === (target < guess ? "left" : "right");
}
