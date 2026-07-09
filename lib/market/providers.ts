import { makeQuote } from "@/lib/market/mock";
import { toFinnhubSymbol } from "@/lib/market/finnhub";
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

interface FinnhubQuoteResponse {
  c?: number;
  d?: number;
  dp?: number;
  h?: number;
  l?: number;
  pc?: number;
  t?: number;
}

export async function getMarketSnapshots(providerSymbols: string[]): Promise<Quote[]> {
  const provider = process.env.MARKET_DATA_PROVIDER ?? "mock";

  if (provider === "finnhub" && getFinnhubToken()) {
    return getFinnhubSnapshots(providerSymbols);
  }

  if (provider === "eodhd" && process.env.EODHD_API_KEY) {
    return getEodhdSnapshots(providerSymbols);
  }

  return providerSymbols.map((providerSymbol) => makeQuote(providerSymbol));
}

function getFinnhubToken() {
  return process.env.FINNHUB_API_KEY ?? process.env.NEXT_PUBLIC_FINNHUB_API_KEY;
}

async function getFinnhubSnapshots(providerSymbols: string[]): Promise<Quote[]> {
  const token = getFinnhubToken()!;

  return Promise.all(
    providerSymbols.map(async (providerSymbol) => {
      const symbol = toFinnhubSymbol(providerSymbol);
      const url = new URL("https://finnhub.io/api/v1/quote");
      url.searchParams.set("symbol", symbol);
      url.searchParams.set("token", token);

      const response = await fetch(url, {
        next: { revalidate: 10 }
      });

      if (!response.ok) {
        throw new Error(`Finnhub quote failed for ${symbol}: ${response.status}`);
      }

      const row = (await response.json()) as FinnhubQuoteResponse;
      const price = Number(row.c ?? 0);
      const previousClose = Number(row.pc ?? price);
      const change = Number(row.d ?? price - previousClose);

      return {
        instrumentId: providerSymbol,
        price,
        previousClose,
        change,
        changePercent: Number(row.dp ?? (previousClose ? (change / previousClose) * 100 : 0)),
        dayHigh: Number(row.h ?? price),
        dayLow: Number(row.l ?? price),
        timestamp: row.t ? new Date(row.t * 1000).toISOString() : new Date().toISOString(),
        source: "finnhub",
        realtime: true
      };
    })
  );
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
    realtime: "Finnhub WebSocket first, Massive/EODHD as paid upgrades",
    fallback: "Finnhub quote REST, then EODHD REST live/delayed snapshot"
  },
  jp_equity: {
    realtime: "Finnhub if symbol is covered; otherwise licensed JP feed adapter",
    fallback: "EODHD global delayed snapshot"
  },
  fx: {
    realtime: "Finnhub WebSocket using OANDA symbols",
    fallback: "Finnhub quote REST, then EODHD REST snapshot"
  }
} as const;
