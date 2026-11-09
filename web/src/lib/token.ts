/**
 * The moderator token: typed into the settings dialog, kept for this tab only
 * (sessionStorage), never in the bundle or localStorage. argus-mint checks it.
 */
const KEY = "assay-moderator-token";
const listeners = new Set<() => void>();

export function getToken(): string {
  try {
    return sessionStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function setToken(token: string): void {
  try {
    if (token) sessionStorage.setItem(KEY, token);
    else sessionStorage.removeItem(KEY);
  } catch {
    // Storage can be off (private mode); the token then lasts until reload via the listeners' state.
  }
  for (const listener of listeners) listener();
}

export function onTokenChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
