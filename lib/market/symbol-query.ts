const providerSymbolPattern = /^[A-Z0-9.^=_:-]+$/;
const maxProviderSymbolLength = 32;
const maxUniqueProviderSymbols = 50;

export type MarketSymbolQueryResult =
  | { ok: true; symbols: string[] }
  | { ok: false; error: string };

export function parseMarketSymbolQuery(value: string | null): MarketSymbolQueryResult {
  const symbols = new Set<string>();

  for (const [index, rawSymbol] of (value ?? "").split(",").entries()) {
    const symbol = rawSymbol.trim().toUpperCase();

    if (!symbol) {
      continue;
    }

    if (symbol.length > maxProviderSymbolLength) {
      return {
        ok: false,
        error: `Provider symbol at position ${index + 1} must be at most ${maxProviderSymbolLength} characters.`
      };
    }

    if (!providerSymbolPattern.test(symbol)) {
      return {
        ok: false,
        error: `Provider symbol at position ${index + 1} contains invalid characters.`
      };
    }

    symbols.add(symbol);

    if (symbols.size > maxUniqueProviderSymbols) {
      return {
        ok: false,
        error: `A maximum of ${maxUniqueProviderSymbols} unique provider symbols is allowed.`
      };
    }
  }

  return { ok: true, symbols: [...symbols].sort() };
}
