/**
 * The owner's wallet, through EIP-1193 (`window.ethereum`). The owner signs the challenge
 * argus-mint issued; argus-mint checks the signature, the message and the address.
 * The browser decides nothing here: it relays. The hosted demo never asks a wallet for anything
 * (CLAUDE.md): in the static build there is no provider, whatever the page has injected.
 */
import { staticDemo } from "./demo";

interface Eip1193 {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

function provider(): Eip1193 | null {
  if (staticDemo()) return null;
  const eth = (globalThis as { ethereum?: Eip1193 }).ethereum;
  return eth && typeof eth.request === "function" ? eth : null;
}

export const hasWallet = (): boolean => provider() !== null;

export async function connectWallet(): Promise<string> {
  const eth = provider();
  if (!eth) throw new Error("No browser wallet found. Install one (e.g. Rabby or MetaMask) to review as the owner.");
  const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
  if (!accounts?.length) throw new Error("The wallet shared no account.");
  return accounts[0];
}

/**
 * personal_sign of a UTF-8 message, hex-encoded as EIP-1193 expects. A wallet that refuses keeps its own words; when
 * the sign-in names another host than this page's, the error also says so (see {@link domainHint}).
 */
export async function signMessage(message: string, address: string): Promise<string> {
  const eth = provider();
  if (!eth) throw new Error("No browser wallet found.");
  try {
    return (await eth.request({ method: "personal_sign", params: [toHex(message), address] })) as string;
  } catch (err) {
    const words = err instanceof Error ? err.message : String(err);
    const hint = domainHint(message, globalThis.location?.host ?? "");
    throw new Error(hint ? `${words} ${hint}` : words);
  }
}

/**
 * Why a wallet may have refused argus-mint's sign-in, or null. Wallets check that an EIP-4361 message's domain is
 * the page's host and warn or refuse when it isn't; argus-mint can't see the page, so it never reports this itself
 * (argus-assay#4). Only explains a refusal the wallet already made: the signature, if any, is argus-mint's to check.
 */
export function domainHint(message: string, host: string): string | null {
  const domain = /^(\S+) wants you to sign in with your Ethereum account:/.exec(message)?.[1];
  if (!domain || !host || domain === host) return null;
  return `The sign-in names ${domain}, but this page is ${host}: argus-mint's ARGUS_MINT_SIWE_DOMAIN must be ${host}.`;
}

export function toHex(text: string): string {
  return `0x${Array.from(new TextEncoder().encode(text), (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export const sameAddress = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();
