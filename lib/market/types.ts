export type AssetClass = "us_equity" | "jp_equity" | "fx" | "custom_index";

export type MarketRegion = "US" | "JP" | "FX" | "CUSTOM";

export type WeightingMode = "equal" | "custom";

export interface Instrument {
  id: string;
  symbol: string;
  providerSymbol: string;
  name: string;
  assetClass: Exclude<AssetClass, "custom_index">;
  market: MarketRegion;
  currency: "USD" | "JPY" | "PAIR";
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
  source: "mock" | "finnhub" | "eodhd" | "massive";
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
}

export interface CustomIndex {
  id: string;
  name: string;
  baseValue: number;
  weighting: WeightingMode;
  members: CustomIndexMember[];
}

export interface MarketCardView {
  id: string;
  symbol: string;
  name: string;
  market: MarketRegion;
  assetClass: AssetClass;
  currency: "USD" | "JPY" | "PAIR";
  quote: Quote;
  series: SeriesPoint[];
  providerSymbol?: string;
}
