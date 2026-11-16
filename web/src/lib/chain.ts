/**
 * Block explorer links for argus-mint's own contracts. Only the Card contract is linked (the one a
 * published voucher was signed for): never a wallet (an owner's or the signer's), so a page links no one's holdings.
 */
const EXPLORERS: Record<string, string> = {
  base: "https://basescan.org",
  base_sepolia: "https://sepolia.basescan.org",
};

const CHAINS: Record<number, string> = { 8453: "base", 84532: "base_sepolia" };

/** argus-mint's network name for an EIP-712 domain's chain id, or null for a chain it doesn't link. */
export const networkFor = (chainId: number | null | undefined): string | null => (chainId != null ? (CHAINS[chainId] ?? null) : null);

/** The Card contract on the explorer for `network`, or null for an unknown network or no card. */
export function cardContractUrl(network: string | null | undefined, card: string | null | undefined): string | null {
  const explorer = network ? EXPLORERS[network] : undefined;
  if (!explorer || !card || !/^0x[0-9a-fA-F]{40}$/.test(card)) return null;
  return `${explorer}/address/${card}`;
}
