/** The index `by` steps from `index` in a list of `length`, wrapping at both ends; null when the list is empty. */
export function step(index: number, by: number, length: number): number | null {
  if (length <= 0) return null;
  return (((index + by) % length) + length) % length;
}

/** The step a key asks for in an image viewer: -1 for ArrowLeft, 1 for ArrowRight, else 0. Ignored with a modifier, so browser shortcuts still work. */
export function keyStep(e: { key: string; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean }): number {
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return 0;
  return e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
}
