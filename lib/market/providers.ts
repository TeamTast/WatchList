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

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      meta?: {
        chartPreviousClose?: number;
        previousClose?: number;
      };
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          close?: Array<number | null>;
          high?: Array<number | null>;
          low?: Array<number | null>;
        }>;
      };
    }>;
    error?: unknown;
  };
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
  const usSymbols = providerSymbols.filter((providerSymbol) => providerSymbol.endsWith(".US"));

  const quotes = await Promise.all(
    usSymbols.map(async (providerSymbol): Promise<Quote | null> => {
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
    return getYahooHistory(providerSymbols);
  }

  return providerSymbols.map((providerSymbol) => ({
    instrumentId: providerSymbol,
    quote: null,
    series: [],
    source: null,
    error: "Market data provider is not configured."
  }));
}

async function getYahooHistory(providerSymbols: string[]): Promise<MarketHistory[]> {
  return Promise.all(
    providerSymbols.map(async (providerSymbol) => {
      const symbol = toYahooSymbol(providerSymbol);
      const url = new URL(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`
      );
      url.searchParams.set("range", "1d");
      url.searchParams.set("interval", "5m");
      url.searchParams.set("includePrePost", "false");

      try {
        const response = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0 WatchList/1.0" },
          next: { revalidate: 300 }
        });

        if (!response.ok) {
          throw new Error(`Chart history failed for ${symbol}: ${response.status}`);
        }

        const payload = (await response.json()) as YahooChartResponse;
        const result = payload.chart?.result?.[0];
        const timestamps = result?.timestamp ?? [];
        const quoteRow = result?.indicators?.quote?.[0];
        const closes = quoteRow?.close ?? [];

        if (!timestamps.length || !closes.length) {
          throw new Error(`Chart history returned no data for ${symbol}`);
        }

        const series = timestamps
          .map((close, index) => ({
            time: Number(close) * 1000,
            value: Number(closes[index])
          }))
          .filter((point) => Number.isFinite(point.time) && Number.isFinite(point.value) && point.value > 0);

        if (!series.length) {
          throw new Error(`Chart history returned invalid data for ${symbol}`);
        }

        const latest = series.at(-1)!;
        const previousClose = Number(
          result?.meta?.chartPreviousClose ?? result?.meta?.previousClose ?? series.at(-2)?.value ?? latest.value
        );
        const highValues = (quoteRow?.high ?? []).filter(
          (value): value is number => typeof value === "number" && Number.isFinite(value)
        );
        const lowValues = (quoteRow?.low ?? []).filter(
          (value): value is number => typeof value === "number" && Number.isFinite(value)
        );
        const values = series.map((point) => point.value);
        const change = latest.value - previousClose;
        const quote: Quote = {
          instrumentId: providerSymbol,
          price: latest.value,
          previousClose,
          change,
          changePercent: previousClose ? (change / previousClose) * 100 : 0,
          dayHigh: Math.max(...(highValues.length ? highValues : values)),
          dayLow: Math.min(...(lowValues.length ? lowValues : values)),
          timestamp: new Date(latest.time).toISOString(),
          source: "yahoo",
          realtime: false
        };

        return {
          instrumentId: providerSymbol,
          quote,
          series,
          source: "yahoo" as const
        };
      } catch (error) {
        return {
          instrumentId: providerSymbol,
          quote: null,
          series: [],
          source: null,
          error: error instanceof Error ? error.message : "Failed to load chart history."
        };
      }
    })
  );
}

function toYahooSymbol(providerSymbol: string) {
  if (providerSymbol.endsWith(".US")) {
    return providerSymbol.slice(0, -3);
  }

  if (providerSymbol.endsWith(".TSE")) {
    return `${providerSymbol.slice(0, -4)}.T`;
  }

  if (providerSymbol.endsWith(".FOREX")) {
    return `${providerSymbol.slice(0, -6)}=X`;
  }

  return providerSymbol;
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
    realtime: "Cached 5-minute chart history",
    fallback: "Yahoo chart history with no Finnhub quote polling"
  }
} as const;
