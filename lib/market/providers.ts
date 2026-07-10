import { toFinnhubSymbol } from "@/lib/market/finnhub";
import type { Quote, SeriesPoint } from "@/lib/market/types";

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

interface FinnhubCandleResponse {
  c?: number[];
  h?: number[];
  l?: number[];
  o?: number[];
  s?: string;
  t?: number[];
  v?: number[];
}

export interface MarketHistory {
  instrumentId: string;
  quote: Quote | null;
  series: SeriesPoint[];
  source: Quote["source"] | null;
  error?: string;
}

export async function getMarketSnapshots(providerSymbols: string[]): Promise<Quote[]> {
  const provider = process.env.MARKET_DATA_PROVIDER ?? "mock";

  if (provider === "finnhub" && getFinnhubToken()) {
    return getFinnhubSnapshots(providerSymbols);
  }

  if (provider === "eodhd" && process.env.EODHD_API_KEY) {
    return getEodhdSnapshots(providerSymbols);
  }

  return [];
}

function getFinnhubToken() {
  return process.env.FINNHUB_API_KEY;
}

async function getFinnhubSnapshots(providerSymbols: string[]): Promise<Quote[]> {
  const token = getFinnhubToken()!;

  const quotes = await Promise.all(
    providerSymbols.map(async (providerSymbol): Promise<Quote | null> => {
      try {
        const symbol = toFinnhubSymbol(providerSymbol);
        const url = new URL("https://finnhub.io/api/v1/quote");
        url.searchParams.set("symbol", symbol);
        url.searchParams.set("token", token);

        const response = await fetch(url, {
          next: { revalidate: 60 }
        });

        if (!response.ok) {
          return null;
        }

        const row = (await response.json()) as FinnhubQuoteResponse;
        const price = Number(row.c ?? 0);

        if (!Number.isFinite(price) || price <= 0) {
          return null;
        }

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
      } catch {
        return null;
      }
    })
  );

  return quotes.filter((quote): quote is Quote => quote !== null);
}

export async function getMarketHistory(providerSymbols: string[]): Promise<MarketHistory[]> {
  const provider = process.env.MARKET_DATA_PROVIDER ?? "mock";

  if (provider === "finnhub" && getFinnhubToken()) {
    return getFinnhubHistory(providerSymbols);
  }

  return providerSymbols.map((providerSymbol) => ({
    instrumentId: providerSymbol,
    quote: null,
    series: [],
    source: null,
    error: "Market data provider is not configured."
  }));
}

async function getFinnhubHistory(providerSymbols: string[]): Promise<MarketHistory[]> {
  const token = getFinnhubToken()!;
  const fifteenMinutes = 15 * 60;
  const now = Math.floor(Date.now() / 1000 / fifteenMinutes) * fifteenMinutes;
  const from = now - 60 * 60 * 24 * 5;

  return Promise.all(
    providerSymbols.map(async (providerSymbol) => {
      const symbol = toFinnhubSymbol(providerSymbol);
      const url = new URL(getFinnhubCandleEndpoint(providerSymbol));
      url.searchParams.set("symbol", symbol);
      url.searchParams.set("resolution", "15");
      url.searchParams.set("from", String(from));
      url.searchParams.set("to", String(now));
      url.searchParams.set("token", token);

      try {
        const response = await fetch(url, {
          next: { revalidate: fifteenMinutes }
        });

        if (!response.ok) {
          throw new Error(`Finnhub candle failed for ${symbol}: ${response.status}`);
        }

        const row = (await response.json()) as FinnhubCandleResponse;

        if (row.s !== "ok" || !row.c?.length || !row.t?.length) {
          throw new Error(`Finnhub candle returned no data for ${symbol}`);
        }

        const series = row.c
          .map((close, index) => ({
            time: Number(row.t?.[index] ?? 0) * 1000,
            value: Number(close)
          }))
          .filter((point) => Number.isFinite(point.time) && Number.isFinite(point.value) && point.value > 0);

        if (!series.length) {
          throw new Error(`Finnhub candle returned invalid data for ${symbol}`);
        }

        const latest = series.at(-1)!;
        const previous = series.at(-2)?.value ?? latest.value;
        const values = series.map((point) => point.value);
        const change = latest.value - previous;
        const quote: Quote = {
          instrumentId: providerSymbol,
          price: latest.value,
          previousClose: previous,
          change,
          changePercent: previous ? (change / previous) * 100 : 0,
          dayHigh: Math.max(...values),
          dayLow: Math.min(...values),
          timestamp: new Date(latest.time).toISOString(),
          source: "finnhub",
          realtime: false
        };

        return {
          instrumentId: providerSymbol,
          quote,
          series,
          source: "finnhub" as const
        };
      } catch (error) {
        return {
          instrumentId: providerSymbol,
          quote: null,
          series: [],
          source: null,
          error: error instanceof Error ? error.message : "Failed to load market history."
        };
      }
    })
  );
}

function getFinnhubCandleEndpoint(providerSymbol: string) {
  if (providerSymbol.endsWith(".FOREX")) {
    return "https://finnhub.io/api/v1/forex/candle";
  }

  return "https://finnhub.io/api/v1/stock/candle";
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
    next: { revalidate: 60 }
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
