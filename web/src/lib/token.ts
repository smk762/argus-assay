/**
 * The moderator token: typed into the settings dialog, kept for this tab only
 * (sessionStorage), never in the bundle or localStorage. argus-mint checks it.
 */
const KEY = "assay-moderator-token";
const listeners = new Set<() => void>();

// The token as set in this page. sessionStorage only carries it across a reload of the tab; when storage is off
// (some private modes) this copy is the token until the page goes, rather than every request going out without it.
let memory: string | null = null;

export function getToken(): string {
  if (memory !== null) return memory;
  try {
    return sessionStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function setToken(token: string): void {
  memory = token;
  try {
    if (token) sessionStorage.setItem(KEY, token);
    else sessionStorage.removeItem(KEY);
  } catch {
    // Storage is off: the token lives in `memory` for this page only.
  }
  for (const listener of listeners) listener();
}

export function onTokenChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
