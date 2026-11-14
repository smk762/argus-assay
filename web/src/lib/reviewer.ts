/**
 * The reviewer's name, remembered in localStorage as a convenience (it is not a secret).
 * Storage can be off or full; a failure here must never stop a review being sent.
 */
const KEY = "assay-reviewer";

export function readReviewer(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveReviewer(name: string): void {
  try {
    localStorage.setItem(KEY, name);
  } catch {
    // Private mode or blocked site data: the name just isn't remembered.
  }
}
