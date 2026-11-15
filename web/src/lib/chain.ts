/**
 * Block explorer links for argus-mint's own contracts. Only the Card contract argus-mint reports in
 * `/health.card` is linked: never a wallet (an owner's or the signer's), so a page links no one's holdings.
 */
const EXPLORERS: Record<string, string> = {
  base: "https://basescan.org",
  base_sepolia: "https://sepolia.basescan.org",
};

/** The Card contract on the explorer for `network`, or null for an unknown network or no card. */
export function cardContractUrl(network: string | null | undefined, card: string | null | undefined): string | null {
  const explorer = network ? EXPLORERS[network] : undefined;
  if (!explorer || !card || !/^0x[0-9a-fA-F]{40}$/.test(card)) return null;
  return `${explorer}/address/${card}`;
}
