import type { Instrument } from "@/lib/market/types";

const explicitFinnhubSymbols: Record<string, string> = {
  aapl: "AAPL",
  nvda: "NVDA",
  msft: "MSFT",
  tsla: "TSLA",
  "7203": "7203.T",
  "9984": "9984.T",
  "6758": "6758.T",
  "8306": "8306.T",
  usdjpy: "OANDA:USD_JPY",
  eurusd: "OANDA:EUR_USD",
  gbpjpy: "OANDA:GBP_JPY",
  audjpy: "OANDA:AUD_JPY"
};

export function toFinnhubSymbol(providerSymbol: string) {
  if (providerSymbol.endsWith(".US")) {
    return providerSymbol.replace(".US", "");
  }

  if (providerSymbol.endsWith(".TSE")) {
    return providerSymbol.replace(".TSE", ".T");
  }

  if (providerSymbol.endsWith(".FOREX")) {
    const pair = providerSymbol.replace(".FOREX", "");
    return `OANDA:${pair.slice(0, 3)}_${pair.slice(3)}`;
  }

  return providerSymbol;
}

export function getFinnhubSymbol(instrument: Instrument) {
  return explicitFinnhubSymbols[instrument.id] ?? toFinnhubSymbol(instrument.providerSymbol);
}
