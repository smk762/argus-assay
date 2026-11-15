import { describe, expect, it } from "vitest";

import { cardContractUrl } from "./chain";

const CARD = "0xCAa3573b5550870A5e15C47c650b8700D70a8fA7";

describe("cardContractUrl", () => {
  it("links the Card contract on the network's explorer", () => {
    expect(cardContractUrl("base_sepolia", CARD)).toBe(`https://sepolia.basescan.org/address/${CARD}`);
    expect(cardContractUrl("base", CARD)).toBe(`https://basescan.org/address/${CARD}`);
  });

  it("links nothing for an unknown network, no card or a malformed address", () => {
    expect(cardContractUrl("anvil", CARD)).toBeNull();
    expect(cardContractUrl("base", null)).toBeNull();
    expect(cardContractUrl("base", "0x1234")).toBeNull();
  });
});
