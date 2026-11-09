/**
 * The owner's wallet, through EIP-1193 (`window.ethereum`). The owner signs the challenge
 * argus-mint issued; argus-mint checks the signature, the message and the address.
 * The browser decides nothing here: it relays.
 */
interface Eip1193 {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

function provider(): Eip1193 | null {
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

/** personal_sign of a UTF-8 message, hex-encoded as EIP-1193 expects. */
export async function signMessage(message: string, address: string): Promise<string> {
  const eth = provider();
  if (!eth) throw new Error("No browser wallet found.");
  return (await eth.request({ method: "personal_sign", params: [toHex(message), address] })) as string;
}

export function toHex(text: string): string {
  return `0x${Array.from(new TextEncoder().encode(text), (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export const sameAddress = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();
