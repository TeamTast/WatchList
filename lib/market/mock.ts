import type { CustomIndex, Instrument, Quote, SeriesPoint } from "@/lib/market/types";

export const instruments: Instrument[] = [
  {
    id: "aapl",
    symbol: "AAPL",
    providerSymbol: "AAPL.US",
    name: "Apple",
    assetClass: "us_equity",
    market: "US",
    currency: "USD"
  },
  {
    id: "nvda",
    symbol: "NVDA",
    providerSymbol: "NVDA.US",
    name: "NVIDIA",
    assetClass: "us_equity",
    market: "US",
    currency: "USD"
  },
  {
    id: "msft",
    symbol: "MSFT",
    providerSymbol: "MSFT.US",
    name: "Microsoft",
    assetClass: "us_equity",
    market: "US",
    currency: "USD"
  },
  {
    id: "tsla",
    symbol: "TSLA",
    providerSymbol: "TSLA.US",
    name: "Tesla",
    assetClass: "us_equity",
    market: "US",
    currency: "USD"
  },
  {
    id: "7203",
    symbol: "7203",
    providerSymbol: "7203.TSE",
    name: "Toyota",
    assetClass: "jp_equity",
    market: "JP",
    currency: "JPY"
  },
  {
    id: "9984",
    symbol: "9984",
    providerSymbol: "9984.TSE",
    name: "SoftBank Group",
    assetClass: "jp_equity",
    market: "JP",
    currency: "JPY"
  },
  {
    id: "6758",
    symbol: "6758",
    providerSymbol: "6758.TSE",
    name: "Sony Group",
    assetClass: "jp_equity",
    market: "JP",
    currency: "JPY"
  },
  {
    id: "8306",
    symbol: "8306",
    providerSymbol: "8306.TSE",
    name: "Mitsubishi UFJ",
    assetClass: "jp_equity",
    market: "JP",
    currency: "JPY"
  },
  {
    id: "usdjpy",
    symbol: "USD/JPY",
    providerSymbol: "USDJPY.FOREX",
    name: "ドル円",
    assetClass: "fx",
    market: "FX",
    currency: "PAIR"
  },
  {
    id: "eurusd",
    symbol: "EUR/USD",
    providerSymbol: "EURUSD.FOREX",
    name: "ユーロドル",
    assetClass: "fx",
    market: "FX",
    currency: "PAIR"
  },
  {
    id: "gbpjpy",
    symbol: "GBP/JPY",
    providerSymbol: "GBPJPY.FOREX",
    name: "ポンド円",
    assetClass: "fx",
    market: "FX",
    currency: "PAIR"
  },
  {
    id: "audjpy",
    symbol: "AUD/JPY",
    providerSymbol: "AUDJPY.FOREX",
    name: "豪ドル円",
    assetClass: "fx",
    market: "FX",
    currency: "PAIR"
  }
];

export const defaultWatchCards = instruments.slice(0, 10).map((instrument) => ({
  id: `card-${instrument.id}`,
  type: "instrument" as const,
  refId: instrument.id
}));

export const defaultIndexes: CustomIndex[] = [
  {
    id: "idx-ai-us",
    name: "米国大型テック指数",
    baseValue: 1000,
    weighting: "equal",
    members: [
      { instrumentId: "nvda", weight: 1 },
      { instrumentId: "msft", weight: 1 },
      { instrumentId: "aapl", weight: 1 }
    ]
  }
];

const bases: Record<string, number> = {
  aapl: 214.4,
  nvda: 137.8,
  msft: 501.2,
  tsla: 318.6,
  "7203": 3095,
  "9984": 11650,
  "6758": 3790,
  "8306": 1965,
  usdjpy: 146.82,
  eurusd: 1.172,
  gbpjpy: 199.4,
  audjpy: 96.7
};

function hash(input: string) {
  return input.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

export function makeSeries(instrumentId: string, points = 96): SeriesPoint[] {
  const base = bases[instrumentId] ?? 100;
  const seed = hash(instrumentId);
  const now = Date.now();

  return Array.from({ length: points }, (_, index) => {
    const wave = Math.sin((index + seed) / 7) * 0.012;
    const drift = (index - points / 2) * 0.00055 * Math.cos(seed);
    const wobble = Math.sin((index + seed) / 3.3) * 0.004;
    const value = base * (1 + wave + drift + wobble);

    return {
      time: now - (points - index) * 60_000,
      value: Number(value.toFixed(base > 1000 ? 0 : 3))
    };
  });
}

export function makeQuote(instrumentId: string, series = makeSeries(instrumentId)): Quote {
  const last = series.at(-1)?.value ?? 100;
  const previous = series.at(-12)?.value ?? last;
  const values = series.map((point) => point.value);
  const change = last - previous;

  return {
    instrumentId,
    price: last,
    previousClose: previous,
    change,
    changePercent: previous === 0 ? 0 : (change / previous) * 100,
    dayHigh: Math.max(...values),
    dayLow: Math.min(...values),
    volume: Math.round((hash(instrumentId) + 120) * 10000),
    timestamp: new Date().toISOString(),
    source: "mock",
    realtime: false
  };
}

export function tickSeries(instrumentId: string, series: SeriesPoint[]) {
  const last = series.at(-1)?.value ?? bases[instrumentId] ?? 100;
  const seed = hash(`${instrumentId}-${series.length}`);
  const jitter = (Math.sin(Date.now() / 8200 + seed) + Math.cos(seed)) * 0.0018;
  const next = Math.max(0.0001, last * (1 + jitter));

  return [
    ...series.slice(1),
    {
      time: Date.now(),
      value: Number(next.toFixed(next > 1000 ? 0 : 4))
    }
  ];
}
