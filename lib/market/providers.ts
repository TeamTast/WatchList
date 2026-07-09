import { makeQuote } from "@/lib/market/mock";
import type { Quote } from "@/lib/market/types";

interface EodhdResponse {
  code?: string;
  timestamp?: number;
  close?: number;
  previousClose?: number;
  change?: number;
  change_p?: number;
  high?: number;
  low?: number;
  volume?: number;
}

export async function getMarketSnapshots(providerSymbols: string[]): Promise<Quote[]> {
  const provider = process.env.MARKET_DATA_PROVIDER ?? "mock";

  if (provider === "eodhd" && process.env.EODHD_API_KEY) {
    return getEodhdSnapshots(providerSymbols);
  }

  return providerSymbols.map((providerSymbol) => makeQuote(providerSymbol));
}

async function getEodhdSnapshots(providerSymbols: string[]): Promise<Quote[]> {
  const first = providerSymbols[0];
  const rest = providerSymbols.slice(1).join(",");
  const url = new URL(`https://eodhd.com/api/real-time/${encodeURIComponent(first)}`);

  if (rest) {
    url.searchParams.set("s", rest);
  }

  url.searchParams.set("api_token", process.env.EODHD_API_KEY!);
  url.searchParams.set("fmt", "json");

  const response = await fetch(url, {
    next: { revalidate: 10 }
  });

  if (!response.ok) {
    throw new Error(`EODHD snapshot failed: ${response.status}`);
  }

  const payload = (await response.json()) as EodhdResponse | EodhdResponse[];
  const rows = Array.isArray(payload) ? payload : [payload];

  return rows.map((row) => {
    const price = Number(row.close ?? 0);
    const previousClose = Number(row.previousClose ?? price);
    const change = Number(row.change ?? price - previousClose);

    return {
      instrumentId: row.code ?? "unknown",
      price,
      previousClose,
      change,
      changePercent: Number(row.change_p ?? (previousClose ? (change / previousClose) * 100 : 0)),
      dayHigh: Number(row.high ?? price),
      dayLow: Number(row.low ?? price),
      volume: row.volume,
      timestamp: row.timestamp ? new Date(row.timestamp * 1000).toISOString() : new Date().toISOString(),
      source: "eodhd",
      realtime: false
    };
  });
}

export const providerRouting = {
  us_equity: {
    realtime: "Massive or EODHD WebSocket server relay",
    fallback: "EODHD REST live/delayed snapshot"
  },
  jp_equity: {
    realtime: "licensed JP feed adapter",
    fallback: "EODHD global delayed snapshot"
  },
  fx: {
    realtime: "Massive or EODHD Forex WebSocket server relay",
    fallback: "EODHD REST snapshot"
  }
} as const;
