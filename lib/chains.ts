export const SUPPORTED_CHAINS = ["base"] as const;
export type SupportedChain = (typeof SUPPORTED_CHAINS)[number];

const EXPLORERS: Record<SupportedChain, string> = { base: "https://basescan.org" };

export function isSupportedChain(chain: string): chain is SupportedChain {
  return (SUPPORTED_CHAINS as readonly string[]).includes(chain);
}

export function isAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

export function explorerAddress(chain: string, address: string): string {
  return `${EXPLORERS[chain as SupportedChain] ?? EXPLORERS.base}/address/${address}`;
}

export function explorerTx(chain: string, tx: string): string {
  return `${EXPLORERS[chain as SupportedChain] ?? EXPLORERS.base}/tx/${tx}`;
}

export function explorerToken(chain: string, token: string): string {
  return `${EXPLORERS[chain as SupportedChain] ?? EXPLORERS.base}/token/${token}`;
}

export function nansenToken(chain: string, token: string): string {
  return `https://app.nansen.ai/token-god-mode?tokenAddress=${token}&chain=${chain}`;
}

export function dexscreenerToken(chain: string, token: string): string {
  return `https://dexscreener.com/${chain}/${token}`;
}
