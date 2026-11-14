/**
 * Where argus-mint is. A function, not a const: the value is baked in at build time
 * (`NEXT_PUBLIC_MINT_URL`), and reading it lazily keeps tests able to change it.
 * An explicitly empty value means same origin (a reverse proxy in front of both).
 */
export function mintUrl(): string {
  const value = process.env.NEXT_PUBLIC_MINT_URL;
  if (value === undefined) return "http://localhost:8108";
  return value.replace(/\/+$/, "");
}
