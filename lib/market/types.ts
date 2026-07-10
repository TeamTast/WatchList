export type AssetClass = "us_equity" | "jp_equity" | "fx" | "market_index" | "commodity" | "custom_index";

export type MarketRegion = "US" | "JP" | "KR" | "FX" | "INDEX" | "COMMODITY" | "CUSTOM";

export type WeightingMode = "equal" | "custom";

export interface Instrument {
  id: string;
  symbol: string;
  providerSymbol: string;
  name: string;
  assetClass: Exclude<AssetClass, "custom_index">;
  market: MarketRegion;
  currency: "USD" | "JPY" | "KRW" | "PAIR";
}

export interface Quote {
  instrumentId: string;
  price: number;
  previousClose: number;
  change: number;
  changePercent: number;
  dayHigh: number;
  dayLow: number;
  volume?: number;
  timestamp: string;
  source: "mock" | "finnhub" | "yahoo" | "eodhd" | "massive";
  realtime: boolean;
}

export interface SeriesPoint {
  time: number;
  value: number;
}

export interface WatchCard {
  id: string;
  type: "instrument" | "index";
  refId: string;
}

export interface CustomIndexMember {
  instrumentId: string;
  weight: number;
  effectiveAt?: string;
}

export interface CustomIndex {
  id: string;
  name: string;
  baseValue: number;
  weighting: WeightingMode;
  members: CustomIndexMember[];
  lastRebalancedAt?: string;
}

export interface MarketCardView {
  id: string;
  symbol: string;
  name: string;
  market: MarketRegion;
  assetClass: AssetClass;
  currency: "USD" | "JPY" | "KRW" | "PAIR";
  quote: Quote | null;
  series: SeriesPoint[];
  providerSymbol?: string;
  status: "loading" | "ready" | "unavailable";
  message?: string;
}
