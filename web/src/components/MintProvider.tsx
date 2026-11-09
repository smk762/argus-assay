"use client";

import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";

import { getHealth } from "@/lib/api";
import { getToken, onTokenChange } from "@/lib/token";
import type { Health } from "@/lib/types";

interface MintState {
  health: Health | null;
  error: string | null;
  refresh: () => Promise<void>;
  /** A moderator token is set for this tab (whether it is right is argus-mint's call). */
  hasToken: boolean;
}

const MintContext = createContext<MintState | null>(null);

const tokenSnapshot = () => getToken() !== "";

/** `/health`, refreshed every 15 s and on demand: what the server can do decides which controls show. */
export function MintProvider({ children }: { children: ReactNode }) {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasToken = useSyncExternalStore(onTokenChange, tokenSnapshot, () => false);

  const refresh = useCallback(async () => {
    try {
      setHealth(await getHealth());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    // The first fetch, then a poll; setState happens after the await, not synchronously.
    const first = setTimeout(() => void refresh(), 0);
    const timer = setInterval(() => void refresh(), 15_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [refresh]);

  return <MintContext.Provider value={{ health, error, refresh, hasToken }}>{children}</MintContext.Provider>;
}

export function useMint(): MintState {
  const value = useContext(MintContext);
  if (!value) throw new Error("useMint outside MintProvider");
  return value;
}
