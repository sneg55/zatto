export const CREDITS: Record<string, number> = {
  "token-screener": 1,
  "tgm/dex-trades": 1,
  "profiler/dex-trades": 1,
  "tgm/token-ohlcv": 1,
};

export class BudgetExhaustedError extends Error {
  constructor(public readonly spent: number, public readonly budget: number) { super(`daily credit budget exhausted: ${spent} of ${budget}`); }
}
