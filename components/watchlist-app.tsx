"use client";

import {
  AlertTriangle,
  BarChart3,
  FolderKanban,
  GripVertical,
  LogIn,
  LockKeyhole,
  Minimize2,
  Moon,
  Plus,
  RefreshCw,
  Save,
  Search,
  Server,
  SlidersHorizontal,
  Square,
  Sun,
  Trash2,
  Undo2,
  Wifi,
  WifiOff,
  X
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { buildIndexQuote, buildIndexSeries } from "@/lib/market/index-builder";
import {
  instruments as defaultInstruments,
  defaultIndexes,
  defaultWatchCards
} from "@/lib/market/mock";
import type {
  AssetClass,
  CustomIndex,
  Instrument,
  MarketCardView,
  MarketRegion,
  Quote,
  SeriesPoint,
  WatchCard
} from "@/lib/market/types";
import type { DiscordGuild, SpaceKind, SpaceSummary, SpacesResponse } from "@/lib/spaces/types";
import { createSupabaseBrowserClient, isSupabaseBrowserConfigured } from "@/lib/supabase/client";

const tabs: Array<{ key: "ALL" | MarketRegion; label: string }> = [
  { key: "ALL", label: "All" },
  { key: "US", label: "米国株" },
  { key: "JP", label: "日本株" },
  { key: "KR", label: "韓国" },
  { key: "FX", label: "FX" },
  { key: "INDEX", label: "指数" },
  { key: "COMMODITY", label: "商品" },
  { key: "CUSTOM", label: "自作指数" }
];

const marketLabels: Record<MarketRegion, string> = {
  US: "US",
  JP: "JP",
  KR: "KR",
  FX: "FX",
  INDEX: "INDEX",
  COMMODITY: "CMDTY",
  CUSTOM: "IDX"
};

const assetLabels: Record<AssetClass, string> = {
  us_equity: "Stock",
  jp_equity: "Stock",
  fx: "FX",
  market_index: "Index",
  commodity: "Commodity",
  custom_index: "Index"
};

const sourceLabels: Record<Quote["source"], string> = {
  mock: "Demo",
  finnhub: "Finnhub",
  yahoo: "Yahoo chart",
  eodhd: "EODHD",
  massive: "Massive"
};

const layoutStorageKey = "watchlist.layout.v1";
const activeSpaceStorageKey = "watchlist.active-space.v1";
const themeStorageKey = "watchlist.theme.v1";
const snapshotPollIntervalMs = 60_000;

function spaceLayoutStorageKey(spaceId: string | null) {
  return spaceId ? `${layoutStorageKey}.${spaceId}` : layoutStorageKey;
}

type Theme = "dark" | "light";

type UndoDeletion = {
  message: string;
  card: WatchCard;
  cardPosition: number;
  customIndex?: CustomIndex;
  indexPosition?: number;
};

function applyDocumentTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "light" ? "#eeede6" : "#090909");
}

function isUsRegularSession(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  if (values.weekday === "Sat" || values.weekday === "Sun") {
    return false;
  }

  const minutes = Number(values.hour) * 60 + Number(values.minute);
  return minutes >= 9 * 60 + 30 && minutes < 16 * 60;
}

const initialWatchCards: WatchCard[] = [
  ...defaultWatchCards,
  { id: "card-idx-ai-us", type: "index", refId: "idx-ai-us" }
];

type SavedLayout = {
  version: 1;
  savedAt: string;
  instruments: Instrument[];
  cards: WatchCard[];
  customIndexes: CustomIndex[];
  compactView: boolean;
  activeTab: "ALL" | MarketRegion;
};

// View preferences stay in local storage and are never included in the shared
// workspace state.
type SharedLayout = Omit<SavedLayout, "activeTab" | "compactView">;

interface SnapshotResponse {
  quotes: Quote[];
}

interface HistoryResponse {
  histories: Array<{
    instrumentId: string;
    quote: Quote | null;
    series: SeriesPoint[];
    source: Quote["source"] | null;
    error?: string;
  }>;
}

interface InstrumentLookupResponse {
  name: string | null;
}

interface InstrumentSearchResponse {
  instruments: Instrument[];
}

function formatPrice(value: number, currency: MarketCardView["currency"]) {
  if (currency === "JPY" || currency === "KRW") {
    return new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 0 }).format(value);
  }

  if (currency === "PAIR") {
    return new Intl.NumberFormat("ja-JP", {
      minimumFractionDigits: value > 10 ? 2 : 4,
      maximumFractionDigits: value > 10 ? 2 : 4
    }).format(value);
  }

  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isMarketRegion(value: unknown): value is MarketRegion {
  return value === "US" || value === "JP" || value === "KR" || value === "FX" || value === "INDEX" || value === "COMMODITY" || value === "CUSTOM";
}

function isInstrument(value: unknown): value is Instrument {
  if (!isObject(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.symbol === "string" &&
    typeof value.providerSymbol === "string" &&
    typeof value.name === "string" &&
    (value.assetClass === "us_equity" ||
      value.assetClass === "jp_equity" ||
      value.assetClass === "fx" ||
      value.assetClass === "market_index" ||
      value.assetClass === "commodity") &&
    isMarketRegion(value.market) &&
    (value.currency === "USD" || value.currency === "JPY" || value.currency === "KRW" || value.currency === "PAIR")
  );
}

function isWatchCard(value: unknown): value is WatchCard {
  if (!isObject(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    (value.type === "instrument" || value.type === "index") &&
    typeof value.refId === "string"
  );
}

function isCustomIndex(value: unknown): value is CustomIndex {
  if (!isObject(value) || !Array.isArray(value.members)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.baseValue === "number" &&
    (value.weighting === "equal" || value.weighting === "custom") &&
    value.members.every(
      (member) =>
        isObject(member) &&
        typeof member.instrumentId === "string" &&
        typeof member.weight === "number"
    )
  );
}

function mergeInstruments(savedInstruments: Instrument[]) {
  const instrumentsById = new Map(defaultInstruments.map((instrument) => [instrument.id, instrument]));

  savedInstruments.forEach((instrument) => {
    instrumentsById.set(instrument.id, instrument);
  });

  return Array.from(instrumentsById.values());
}

function parseSavedLayout(layout: unknown): SavedLayout | null {
  if (!isObject(layout)) {
    return null;
  }

  const activeTab = layout.activeTab === "ALL" || isMarketRegion(layout.activeTab) ? layout.activeTab : "ALL";
  const instruments = Array.isArray(layout.instruments)
    ? layout.instruments.filter(isInstrument)
    : defaultInstruments;
  const cards = Array.isArray(layout.cards) ? layout.cards.filter(isWatchCard) : initialWatchCards;
  const customIndexes = Array.isArray(layout.customIndexes)
    ? layout.customIndexes.filter(isCustomIndex)
    : defaultIndexes;

  if (!cards.length) {
    return null;
  }

  return {
    version: 1,
    savedAt: typeof layout.savedAt === "string" ? layout.savedAt : new Date().toISOString(),
    instruments,
    cards,
    customIndexes,
    compactView: Boolean(layout.compactView),
    activeTab
  };
}

function readSavedLayout(storage: Storage, storageKey = layoutStorageKey): SavedLayout | null {
  const rawLayout = storage.getItem(storageKey);

  if (!rawLayout) {
    return null;
  }

  try {
    return parseSavedLayout(JSON.parse(rawLayout) as unknown);
  } catch {
    return null;
  }
}

function createSavedLayout(layout: Omit<SavedLayout, "version" | "savedAt">): SavedLayout {
  return {
    ...layout,
    version: 1,
    savedAt: new Date().toISOString()
  };
}

function createSharedLayout(layout: SavedLayout): SharedLayout {
  const { activeTab: _activeTab, compactView: _compactView, ...sharedLayout } = layout;
  return sharedLayout;
}

function layoutFingerprint(layout: SharedLayout) {
  return JSON.stringify({
    instruments: layout.instruments,
    cards: layout.cards,
    customIndexes: layout.customIndexes
  });
}

function formatChange(quote: Quote) {
  const valueSign = quote.change >= 0 ? "+" : "";
  const percentSign = quote.changePercent >= 0 ? "+" : "";

  return {
    value: `${valueSign}${quote.change.toFixed(Math.abs(quote.change) > 10 ? 1 : 2)}`,
    percent: `${percentSign}${quote.changePercent.toFixed(2)}%`
  };
}

function classForChange(value: number) {
  if (value > 0) {
    return "positive";
  }
  if (value < 0) {
    return "negative";
  }
  return "neutral";
}

function formatLivePrice(value: number) {
  if (value >= 1000) {
    return Number(value.toFixed(0));
  }

  if (value >= 10) {
    return Number(value.toFixed(3));
  }

  return Number(value.toFixed(5));
}

function appendSeriesPoint(series: SeriesPoint[], point: SeriesPoint) {
  const lastPoint = series.at(-1);

  if (!series.length) {
    return [point];
  }

  if (lastPoint && point.time - lastPoint.time < 1_500) {
    return [...series.slice(0, -1), point];
  }

  return [...series.slice(1), point];
}

function buildSeriesFromQuote(quote: Quote): SeriesPoint[] {
  const timestamp = Date.parse(quote.timestamp);
  const currentTime = Number.isFinite(timestamp) ? timestamp : Date.now();
  const previousTime = currentTime - 60 * 60 * 1000;

  if (
    Number.isFinite(quote.previousClose) &&
    quote.previousClose > 0 &&
    quote.previousClose !== quote.price
  ) {
    return [
      {
        time: previousTime,
        value: formatLivePrice(quote.previousClose)
      },
      {
        time: currentTime,
        value: formatLivePrice(quote.price)
      }
    ];
  }

  return [
    {
      time: currentTime,
      value: formatLivePrice(quote.price)
    }
  ];
}

function buildQuoteFromSeries(instrumentId: string, series: SeriesPoint[], source: Quote["source"]) {
  const latest = series.at(-1);

  if (!latest) {
    return null;
  }

  const previous = series.at(-2)?.value ?? latest.value;
  const values = series.map((point) => point.value);
  const change = latest.value - previous;

  return {
    instrumentId,
    price: latest.value,
    previousClose: previous,
    change,
    changePercent: previous ? (change / previous) * 100 : 0,
    dayHigh: Math.max(...values),
    dayLow: Math.min(...values),
    timestamp: new Date(latest.time).toISOString(),
    source,
    realtime: source === "finnhub"
  } satisfies Quote;
}

function createInstrumentFromInput(input: string): Instrument | null {
  const raw = input.trim().toUpperCase().replace(/\s+/g, "");

  if (!raw) {
    return null;
  }

  const pair = raw.replace("/", "");

  if (/^[A-Z]{6}$/.test(pair)) {
    return {
      id: `fx-${pair.toLowerCase()}`,
      symbol: `${pair.slice(0, 3)}/${pair.slice(3)}`,
      providerSymbol: `${pair}.FOREX`,
      name: `${pair.slice(0, 3)}/${pair.slice(3)}`,
      assetClass: "fx",
      market: "FX",
      currency: "PAIR"
    };
  }

  // Tokyo Stock Exchange codes are usually four digits, but recent listings can
  // use a three-digit code followed by a letter (for example, Kioxia: 285A).
  if (/^(?:\d{4}|\d{3}[A-Z])$/.test(raw)) {
    return {
      id: `jp-${raw}`,
      symbol: raw,
      providerSymbol: `${raw}.TSE`,
      name: raw,
      assetClass: "jp_equity",
      market: "JP",
      currency: "JPY"
    };
  }

  if (/^[A-Z.]{1,12}$/.test(raw)) {
    return {
      id: `us-${raw.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      symbol: raw,
      providerSymbol: `${raw}.US`,
      name: raw,
      assetClass: "us_equity",
      market: "US",
      currency: "USD"
    };
  }

  return null;
}

function EditableCardName({ name, onRename }: { name: string; onRename: (name: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);

  useEffect(() => {
    if (!editing) {
      setDraft(name);
    }
  }, [editing, name]);

  function save() {
    const nextName = draft.trim();
    setEditing(false);

    if (nextName && nextName !== name) {
      onRename(nextName);
    }
  }

  if (editing) {
    return (
      <input
        className="card-name-input"
        aria-label="銘柄名"
        autoFocus
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) {
            return;
          }

          if (event.key === "Enter") {
            event.currentTarget.blur();
          }

          if (event.key === "Escape") {
            setDraft(name);
            setEditing(false);
          }
        }}
      />
    );
  }

  return (
    <span
      className="card-name"
      title="ダブルクリックで名前を変更"
      onDoubleClick={() => setEditing(true)}
    >
      {name}
    </span>
  );
}

function reorderCards(cards: WatchCard[], activeId: string, overId: string) {
  const from = cards.findIndex((card) => card.id === activeId);
  const to = cards.findIndex((card) => card.id === overId);

  if (from < 0 || to < 0 || from === to) {
    return cards;
  }

  const next = [...cards];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

function formatSeriesTime(time: number) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(new Date(time));
}

type CalloutAnchor = "top-left" | "top-right" | "bottom-left" | "bottom-right";

function Sparkline({
  series,
  tone,
  currency,
  previousClose
}: {
  series: SeriesPoint[];
  tone: "positive" | "negative" | "neutral";
  currency: MarketCardView["currency"];
  previousClose: number;
}) {
  const width = 420;
  const height = 128;
  const padding = 10;
  const tooltipId = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const touchActive = useRef(false);
  const leaderScaleRatio = useRef(1);
  const calloutAnchorRef = useRef<CalloutAnchor | null>(null);
  const pendingAnchorRef = useRef<CalloutAnchor | null>(null);
  const anchorTimeoutRef = useRef<number | null>(null);
  const [activeTime, setActiveTime] = useState<number | null>(null);
  const [calloutAnchor, setCalloutAnchor] = useState<CalloutAnchor | null>(null);
  const orderedSeries = useMemo(() => {
    const pointsByTime = new Map<number, SeriesPoint>();

    series.forEach((point) => {
      if (Number.isFinite(point.time) && Number.isFinite(point.value)) {
        pointsByTime.set(point.time, point);
      }
    });

    return Array.from(pointsByTime.values()).sort((a, b) => a.time - b.time);
  }, [series]);
  const values = orderedSeries.map((point) => point.value);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 0;
  const range = max - min || 1;
  const isFlatSeries = max === min;
  const valueToY = (value: number) => isFlatSeries
    ? height / 2
    : height - padding - ((value - min) / range) * (height - padding * 2);
  const minTime = orderedSeries[0]?.time ?? 0;
  const maxTime = orderedSeries.at(-1)?.time ?? minTime;
  const timeRange = maxTime - minTime;
  const points = orderedSeries.map((point) => ({
    point,
    x: timeRange
      ? padding + ((point.time - minTime) / timeRange) * (width - padding * 2)
      : width / 2,
    y: valueToY(point.value)
  }));
  const line = points
    .map(({ x, y }, index) => `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`)
    .join(" ");
  const area = `${line} L${width - padding},${height - padding} L${padding},${height - padding} Z`;
  const singleY = height / 2;
  const activeIndex = activeTime === null
    ? -1
    : points.findIndex(({ point }) => point.time === activeTime);
  const activePoint = activeIndex >= 0 ? points[activeIndex] : null;
  const terminalPoint = points.at(-1) ?? null;
  const fallbackPoint = activePoint ?? terminalPoint;
  const fallbackHorizontal = activePoint && activePoint.x < width / 2 ? "left" : "right";
  const fallbackVertical = activePoint && activePoint.y < height / 2 ? "top" : "bottom";
  const displayedAnchor = calloutAnchor ?? `${fallbackVertical}-${fallbackHorizontal}` as CalloutAnchor;
  const calloutHorizontal = displayedAnchor.endsWith("left") ? "left" : "right";
  const calloutVertical = displayedAnchor.startsWith("top") ? "top" : "bottom";
  const leaderAnchorY = calloutVertical === "top" ? valueToY(max) : valueToY(min);
  const leaderEndX = calloutHorizontal === "left" ? -20 : width + 20;
  const leaderDirection = calloutHorizontal === "left" ? -1 : 1;
  const desiredElbowX = activePoint
    ? activePoint.x + leaderDirection * Math.abs(leaderAnchorY - activePoint.y) / Math.max(leaderScaleRatio.current, 0.01)
    : 0;
  const leaderElbowX = calloutHorizontal === "left"
    ? Math.max(leaderEndX, desiredElbowX)
    : Math.min(leaderEndX, desiredElbowX);
  const showPreviousClose = points.length > 0
    && Number.isFinite(previousClose)
    && previousClose >= min
    && previousClose <= max;
  const previousCloseY = valueToY(previousClose);

  function cancelPendingAnchor() {
    if (anchorTimeoutRef.current !== null) {
      window.clearTimeout(anchorTimeoutRef.current);
      anchorTimeoutRef.current = null;
    }

    pendingAnchorRef.current = null;
  }

  function scheduleCalloutAnchor(candidate: CalloutAnchor) {
    const current = calloutAnchorRef.current;

    if (current === null) {
      cancelPendingAnchor();
      calloutAnchorRef.current = candidate;
      setCalloutAnchor(candidate);
      return;
    }

    if (candidate === current) {
      cancelPendingAnchor();
      return;
    }

    if (pendingAnchorRef.current === candidate && anchorTimeoutRef.current !== null) {
      return;
    }

    cancelPendingAnchor();
    pendingAnchorRef.current = candidate;
    anchorTimeoutRef.current = window.setTimeout(() => {
      calloutAnchorRef.current = candidate;
      pendingAnchorRef.current = null;
      anchorTimeoutRef.current = null;
      setCalloutAnchor(candidate);
    }, 500);
  }

  function clearActiveSelection() {
    cancelPendingAnchor();
    calloutAnchorRef.current = null;
    setCalloutAnchor(null);
    setActiveTime(null);
  }

  useEffect(() => () => {
    if (anchorTimeoutRef.current !== null) {
      window.clearTimeout(anchorTimeoutRef.current);
    }
  }, []);

  function updateCalloutGeometry(pointX: number, pointY: number) {
    const svg = svgRef.current;

    if (!svg) {
      return;
    }

    const bounds = svg.getBoundingClientRect();
    const scaleX = bounds.width / width;
    const scaleY = bounds.height / height;
    leaderScaleRatio.current = scaleY ? scaleX / scaleY : 1;

    const preferredSide = pointX < width / 2 ? "left" : "right";
    const calloutWidth = 174;
    const leftFits = bounds.left - calloutWidth >= 8;
    const rightFits = bounds.right + calloutWidth <= window.innerWidth - 8;
    const resolvedSide = preferredSide === "left"
      ? leftFits
        ? "left"
        : rightFits
          ? "right"
          : "left"
      : rightFits
        ? "right"
        : leftFits
          ? "left"
          : "right";

    const verticalSide = pointY < height / 2 ? "top" : "bottom";
    scheduleCalloutAnchor(`${verticalSide}-${resolvedSide}` as CalloutAnchor);
  }

  function selectNearestPoint(clientX: number, clientY: number) {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();

    if (!svg || !matrix || !points.length) {
      return;
    }

    const pointer = svg.createSVGPoint();
    pointer.x = clientX;
    pointer.y = clientY;
    const chartPoint = pointer.matrixTransform(matrix.inverse());
    const nearest = points.reduce((best, candidate) =>
      Math.abs(candidate.x - chartPoint.x) < Math.abs(best.x - chartPoint.x) ? candidate : best
    );

    updateCalloutGeometry(nearest.x, nearest.y);
    setActiveTime((current) => current === nearest.point.time ? current : nearest.point.time);
  }

  function selectPointAt(index: number) {
    const point = points[Math.max(0, Math.min(points.length - 1, index))];

    if (point) {
      updateCalloutGeometry(point.x, point.y);
      setActiveTime(point.point.time);
    }
  }

  return (
    <figure className="chart-frame">
      <div
        className="chart-plot"
        role="slider"
        tabIndex={0}
        aria-label="価格推移の時点"
        aria-valuemin={0}
        aria-valuemax={Math.max(points.length - 1, 0)}
        aria-valuenow={activeIndex >= 0 ? activeIndex : Math.max(points.length - 1, 0)}
        aria-valuetext={fallbackPoint
          ? `${formatSeriesTime(fallbackPoint.point.time)} JST、${formatPrice(fallbackPoint.point.value, currency)}${currency === "PAIR" ? "" : ` ${currency}`}`
          : "価格データなし"}
        aria-describedby={activePoint ? tooltipId : undefined}
        onFocus={() => {
          if (activeTime === null) {
            selectPointAt(points.length - 1);
          }
        }}
        onBlur={clearActiveSelection}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            const currentIndex = activeIndex >= 0 ? activeIndex : points.length - 1;
            selectPointAt(currentIndex + (event.key === "ArrowLeft" ? -1 : 1));
          } else if (event.key === "Home" || event.key === "End") {
            event.preventDefault();
            selectPointAt(event.key === "Home" ? 0 : points.length - 1);
          } else if (event.key === "Escape") {
            clearActiveSelection();
            event.currentTarget.blur();
          }
        }}
        onPointerDown={(event) => {
          touchActive.current = event.pointerType === "touch";
          selectNearestPoint(event.clientX, event.clientY);
        }}
        onPointerMove={(event) => {
          if (event.pointerType !== "touch" || touchActive.current) {
            selectNearestPoint(event.clientX, event.clientY);
          }
        }}
        onPointerUp={() => {
          touchActive.current = false;
        }}
        onPointerCancel={() => {
          touchActive.current = false;
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse") {
            clearActiveSelection();
          }
        }}
        onDragStart={(event) => event.preventDefault()}
      >
        <span className="chart-axis chart-axis-y" aria-hidden="true">Y / price</span>
        <span className="chart-axis chart-axis-x" aria-hidden="true">X / time · JST</span>
        <svg ref={svgRef} className="sparkline" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
          <title>{`価格推移、${orderedSeries.length}点、安値${formatPrice(min, currency)}、高値${formatPrice(max, currency)}`}</title>
          {showPreviousClose ? (
            <line
              className="sparkline-previous-close"
              x1={padding}
              x2={width - padding}
              y1={previousCloseY}
              y2={previousCloseY}
            />
          ) : null}
          {points.length > 1 ? (
            <>
              <path d={area} fill={`var(--${tone})`} opacity="0.04" />
              <path
                d={line}
                fill="none"
                stroke={`var(--${tone})`}
                strokeLinecap="square"
                strokeLinejoin="miter"
                strokeWidth="1.6"
                vectorEffect="non-scaling-stroke"
              />
            </>
          ) : points.length === 1 ? (
            <line
              x1={padding}
              x2={width - padding}
              y1={singleY}
              y2={singleY}
              stroke={`var(--${tone})`}
              strokeDasharray="3 6"
              strokeOpacity="0.42"
              strokeWidth="1.4"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
          {terminalPoint ? (
            <>
              <line
                className="sparkline-guide"
                x1={terminalPoint.x}
                x2={width - padding}
                y1={terminalPoint.y}
                y2={terminalPoint.y}
                stroke={`var(--${tone})`}
              />
              <rect
                className="sparkline-terminal"
                x={terminalPoint.x - 2.5}
                y={terminalPoint.y - 2.5}
                width="5"
                height="5"
                stroke={`var(--${tone})`}
              />
            </>
          ) : null}
          {activePoint ? (
            <g className="sparkline-crosshair">
              <line x1={activePoint.x} x2={activePoint.x} y1={padding} y2={height - padding} />
              <line x1={padding} x2={width - padding} y1={activePoint.y} y2={activePoint.y} />
              <path
                className="sparkline-callout-leader"
                d={`M${activePoint.x},${activePoint.y} L${leaderElbowX},${leaderAnchorY} H${leaderEndX}`}
              />
              <rect
                x={activePoint.x - 3.5}
                y={activePoint.y - 3.5}
                width="7"
                height="7"
                fill="var(--surface)"
                stroke={`var(--${tone})`}
                strokeWidth="1.5"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          ) : null}
        </svg>
        {activePoint ? (
          <div
            id={tooltipId}
            className={`chart-callout ${displayedAnchor}`}
            role="tooltip"
            style={{ top: `${(leaderAnchorY / height) * 100}%` }}
          >
            <span>Time</span>
            <strong>{formatSeriesTime(activePoint.point.time)} JST</strong>
            <span>Price</span>
            <strong>{formatPrice(activePoint.point.value, currency)}</strong>
          </div>
        ) : null}
      </div>
    </figure>
  );
}

function MarketCard({
  card,
  dragging,
  onRemove,
  onManageIndex,
  onRename,
  onDragStart,
  onDragEnter,
  onDragEnd
}: {
  card: MarketCardView;
  dragging: boolean;
  onRemove: (id: string) => void;
  onManageIndex: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDragStart: (id: string) => void;
  onDragEnter: (id: string) => void;
  onDragEnd: () => void;
}) {
  const changeClass = classForChange(card.quote?.change ?? 0);
  const formattedChange = card.quote ? formatChange(card.quote) : null;

  return (
    <article
      className={`market-card ${dragging ? "dragging" : ""}`}
      onDragEnter={() => onDragEnter(card.id)}
      onDragOver={(event) => event.preventDefault()}
      onDragEnd={onDragEnd}
      onDrop={onDragEnd}
    >
      <header className="card-top">
        <button
          className="icon-button muted drag-handle"
          draggable
          aria-label="並べ替え"
          title="並べ替え"
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = "move";
            onDragStart(card.id);
          }}
        >
          <GripVertical size={17} />
        </button>
        <div className="symbol-block">
          {card.assetClass === "custom_index" ? (
            <>
              <div className="symbol-row">
                <EditableCardName name={card.symbol} onRename={(name) => onRename(card.id, name)} />
                <span className={`market-pill ${card.market.toLowerCase()}`}>{marketLabels[card.market]}</span>
              </div>
              <span className="ticker-code">{card.name}</span>
            </>
          ) : (
            <>
              <div className="symbol-row">
                <EditableCardName name={card.name} onRename={(name) => onRename(card.id, name)} />
                <span className={`market-pill ${card.market.toLowerCase()}`}>{marketLabels[card.market]}</span>
              </div>
              <span className="ticker-code">{card.symbol}</span>
            </>
          )}
        </div>
        <div className="card-actions">
          {card.assetClass === "custom_index" ? (
            <button
              className="icon-button manage-index"
              title="構成銘柄を管理"
              aria-label={`${card.symbol}の構成銘柄を管理`}
              onClick={() => onManageIndex(card.id)}
            >
              <SlidersHorizontal size={16} />
            </button>
          ) : null}
          <button className="icon-button danger" title="削除" onClick={() => onRemove(card.id)}>
            <Trash2 size={16} />
          </button>
        </div>
      </header>

      {card.quote && card.series.length ? (
        <>
          <div className="price-row">
            <div className="price-metric">
              <div>
                <span className="price">{formatPrice(card.quote.price, card.currency)}</span>
                <span className="currency">{card.currency === "PAIR" ? "" : card.currency}</span>
              </div>
            </div>
            <div className="change-metric">
              <span className="metric-label">Δ / day</span>
              <span className={`change ${changeClass}`}>
                <span>{formattedChange?.value}</span>
                <span className="change-divider" aria-hidden="true">/</span>
                <span>{formattedChange?.percent}</span>
              </span>
            </div>
          </div>

          <Sparkline
            series={card.series}
            tone={changeClass}
            currency={card.currency}
            previousClose={card.quote.previousClose}
          />
        </>
      ) : (
        <div className="no-data-panel">
          <strong>{card.status === "loading" ? "取得中" : "データなし"}</strong>
          <span>{card.message ?? "価格データを取得できませんでした。"}</span>
        </div>
      )}

      <footer className="card-meta">
        <span>
          {assetLabels[card.assetClass]} · {card.quote ? sourceLabels[card.quote.source] : "No data"}
        </span>
        {card.quote ? (
          <>
            <span>Hi {formatPrice(card.quote.dayHigh, card.currency)}</span>
            <span>Lo {formatPrice(card.quote.dayLow, card.currency)}</span>
          </>
        ) : null}
      </footer>
    </article>
  );
}

function AddInstrumentDialog({
  availableInstruments,
  existingInstrumentIds,
  onClose,
  onAdd
}: {
  availableInstruments: Instrument[];
  existingInstrumentIds: string[];
  onClose: () => void;
  onAdd: (instrument: Instrument) => void;
}) {
  const [query, setQuery] = useState("");
  const [nameLookup, setNameLookup] = useState<{ providerSymbol: string; name: string | null } | null>(null);
  const [nameSearchResults, setNameSearchResults] = useState<Instrument[]>([]);
  const customInstrument = createInstrumentFromInput(query);
  const isJapaneseCustomInstrument = customInstrument?.assetClass === "jp_equity";

  useEffect(() => {
    if (!isJapaneseCustomInstrument || !customInstrument) {
      setNameLookup(null);
      return;
    }

    const controller = new AbortController();
    let active = true;
    const timeout = window.setTimeout(() => {
      void fetch(`/api/market/instrument?providerSymbol=${encodeURIComponent(customInstrument.providerSymbol)}`, {
        signal: controller.signal
      })
        .then(async (response) => {
          if (!response.ok) {
            return null;
          }

          return (await response.json()) as InstrumentLookupResponse;
        })
        .then((result) => {
          if (active) {
            setNameLookup({ providerSymbol: customInstrument.providerSymbol, name: result?.name ?? null });
          }
        })
        .catch(() => {
          if (active && !controller.signal.aborted) {
            setNameLookup({ providerSymbol: customInstrument.providerSymbol, name: null });
          }
        });
    }, 250);

    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [customInstrument?.providerSymbol, isJapaneseCustomInstrument]);

  useEffect(() => {
    const searchQuery = query.trim();

    if (searchQuery.length < 2) {
      setNameSearchResults([]);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      void fetch(`/api/market/instrument?query=${encodeURIComponent(searchQuery)}`, { signal: controller.signal })
        .then(async (response) => (response.ok ? ((await response.json()) as InstrumentSearchResponse) : null))
        .then((result) => setNameSearchResults(result?.instruments ?? []))
        .catch(() => {
          if (!controller.signal.aborted) {
            setNameSearchResults([]);
          }
        });
    }, 300);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [query]);

  const resolvedName = nameLookup?.providerSymbol === customInstrument?.providerSymbol ? nameLookup?.name ?? null : null;
  const instrumentToAdd = customInstrument && resolvedName ? { ...customInstrument, name: resolvedName } : customInstrument;
  const canAddCustom =
    instrumentToAdd &&
    !existingInstrumentIds.includes(instrumentToAdd.id) &&
    !availableInstruments.some((instrument) => instrument.providerSymbol === instrumentToAdd.providerSymbol);
  const candidates = Array.from(
    new Map(
      [...availableInstruments, ...nameSearchResults]
        .filter((instrument) => !existingInstrumentIds.includes(instrument.id))
        .filter((instrument) => {
          const haystack = `${instrument.symbol} ${instrument.name} ${instrument.providerSymbol}`.toLowerCase();
          return haystack.includes(query.toLowerCase()) || nameSearchResults.includes(instrument);
        })
        .map((instrument) => [instrument.providerSymbol, instrument])
    ).values()
  );

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-panel" role="dialog" aria-modal="true" aria-label="銘柄追加">
        <header className="modal-header">
          <div>
            <h2>銘柄を追加</h2>
            <p>米国株、日本株、FXをウォッチリストに入れます。</p>
          </div>
          <button className="icon-button muted" title="閉じる" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <label className="search-box">
          <Search size={17} />
          <input
            autoFocus
            placeholder="AAPL, キオクシア, 7203, USDJPY..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        <div className="candidate-list">
          {canAddCustom ? (
            <button
              className="candidate-row create-row"
              onClick={() => {
                onAdd(instrumentToAdd);
                onClose();
              }}
            >
              <span>
                <strong>{instrumentToAdd.symbol}</strong>
                <small>{resolvedName ?? `${instrumentToAdd.providerSymbol} を追加`}</small>
              </span>
              <span className={`market-pill ${instrumentToAdd.market.toLowerCase()}`}>
                {marketLabels[instrumentToAdd.market]}
              </span>
            </button>
          ) : null}
          {candidates.map((instrument) => (
            <button
              key={instrument.id}
              className="candidate-row"
              onClick={() => {
                onAdd(instrument);
                onClose();
              }}
            >
              <span>
                <strong>{instrument.symbol}</strong>
                <small>{instrument.name}</small>
              </span>
              <span className={`market-pill ${instrument.market.toLowerCase()}`}>
                {marketLabels[instrument.market]}
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function IndexDialog({
  cards,
  onClose,
  onCreate
}: {
  cards: MarketCardView[];
  onClose: () => void;
  onCreate: (customIndex: CustomIndex) => void;
}) {
  const eligible = cards.filter((card) => card.assetClass !== "custom_index");
  const [name, setName] = useState("オリジナル指数");
  const [selected, setSelected] = useState(eligible.slice(0, 4).map((card) => card.id));

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-panel" role="dialog" aria-modal="true" aria-label="指数作成">
        <header className="modal-header">
          <div>
            <h2>指数を作成</h2>
            <p>選んだ銘柄を1000基準の等ウェイト指数にします。</p>
          </div>
          <button className="icon-button muted" title="閉じる" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <label className="field">
          <span>指数名</span>
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>

        <div className="check-list">
          {eligible.map((card) => (
            <label key={card.id} className="check-row">
              <input
                type="checkbox"
                checked={selected.includes(card.id)}
                onChange={(event) => {
                  setSelected((current) =>
                    event.target.checked
                      ? [...current, card.id]
                      : current.filter((instrumentId) => instrumentId !== card.id)
                  );
                }}
              />
              <span>
                <strong>{card.symbol}</strong>
                <small>{card.name}</small>
              </span>
            </label>
          ))}
        </div>

        <button
          className="primary-button wide"
          disabled={selected.length < 2 || !name.trim()}
          onClick={() => {
            onCreate({
              id: `idx-${crypto.randomUUID()}`,
              name: name.trim(),
              baseValue: 1000,
              weighting: "equal",
              members: selected.map((instrumentId) => ({
                instrumentId,
                weight: 1,
                effectiveAt: new Date().toISOString()
              })),
              lastRebalancedAt: new Date().toISOString()
            });
            onClose();
          }}
        >
          <BarChart3 size={17} />
          作成
        </button>
      </section>
    </div>
  );
}

function IndexManagementDialog({
  customIndex,
  instruments,
  quotesByInstrument,
  seriesByInstrument,
  onClose,
  onUpdate
}: {
  customIndex: CustomIndex;
  instruments: Instrument[];
  quotesByInstrument: Record<string, Quote>;
  seriesByInstrument: Record<string, SeriesPoint[]>;
  onClose: () => void;
  onUpdate: (customIndex: CustomIndex) => void;
}) {
  const totalWeight = customIndex.members.reduce((sum, member) => sum + member.weight, 0) || 1;
  const [weights, setWeights] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      customIndex.members.map((member) => [
        member.instrumentId,
        ((member.weight / totalWeight) * 100).toFixed(2)
      ])
    )
  );
  const [replacements, setReplacements] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState("");
  const memberIds = customIndex.members.map((member) => member.instrumentId);
  const enteredTotal = customIndex.members.reduce(
    (sum, member) => sum + (Number(weights[member.instrumentId]) || 0),
    0
  );
  const validWeights = customIndex.members.every((member) => Number(weights[member.instrumentId]) > 0);
  const totalIsValid = Math.abs(enteredTotal - 100) < 0.01;
  const positionValues = customIndex.members.map((member) => {
    const series = seriesByInstrument[member.instrumentId] ?? [];
    const latest = series.at(-1);
    const effectiveTime = member.effectiveAt ? Date.parse(member.effectiveAt) : Number.NaN;
    const base = Number.isFinite(effectiveTime)
      ? series.find((point) => point.time >= effectiveTime) ?? latest
      : series[0];
    const relativeValue = latest && base?.value ? latest.value / base.value : 1;
    return {
      instrumentId: member.instrumentId,
      value: (member.weight / totalWeight) * relativeValue
    };
  });
  const totalPositionValue = positionValues.reduce((sum, position) => sum + position.value, 0) || 1;
  const currentWeights = Object.fromEntries(
    positionValues.map((position) => [position.instrumentId, (position.value / totalPositionValue) * 100])
  );

  function setEqualWeights() {
    const equalWeight = Math.floor(10000 / customIndex.members.length) / 100;
    setWeights(
      Object.fromEntries(
        customIndex.members.map((member, index) => [
          member.instrumentId,
          index === customIndex.members.length - 1
            ? (100 - equalWeight * (customIndex.members.length - 1)).toFixed(2)
            : equalWeight.toFixed(2)
        ])
      )
    );
    setFeedback("");
  }

  function replaceMember(instrumentId: string) {
    const replacementId = replacements[instrumentId];
    if (!replacementId) {
      return;
    }

    const nextMembers = customIndex.members.map((member) =>
      member.instrumentId === instrumentId
        ? { ...member, instrumentId: replacementId, effectiveAt: new Date().toISOString() }
        : member
    );
    const nextWeights = { ...weights, [replacementId]: weights[instrumentId] };
    delete nextWeights[instrumentId];
    setWeights(nextWeights);
    setReplacements({});
    onUpdate({ ...customIndex, members: nextMembers });
    setFeedback("構成銘柄を入れ替えました。リバランス比率は引き継がれています。");
  }

  function rebalance() {
    if (!validWeights || !totalIsValid) {
      return;
    }

    const rebalancedAt = new Date().toISOString();
    const nextMembers = customIndex.members.map((member) => ({
      ...member,
      weight: Number(weights[member.instrumentId]),
      effectiveAt: rebalancedAt
    }));
    const firstWeight = nextMembers[0]?.weight ?? 0;
    const isEqual = nextMembers.every((member) => Math.abs(member.weight - firstWeight) < 0.01);
    onUpdate({
      ...customIndex,
      members: nextMembers,
      weighting: isEqual ? "equal" : "custom",
      lastRebalancedAt: rebalancedAt
    });
    setFeedback("新しい構成比率でリバランスしました。");
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-panel index-management-modal" role="dialog" aria-modal="true" aria-label="指数の構成銘柄管理">
        <header className="modal-header">
          <div>
            <span className="eyebrow">Index constituents</span>
            <h2>{customIndex.name}</h2>
            <p>構成銘柄の確認、入れ替え、構成比率のリバランスができます。</p>
          </div>
          <button className="icon-button muted" title="閉じる" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <div className="index-management-summary">
          <span>{customIndex.members.length}銘柄</span>
          <span>{customIndex.weighting === "equal" ? "等ウェイト" : "カスタムウェイト"}</span>
          <span>
            最終リバランス: {customIndex.lastRebalancedAt
              ? new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" }).format(new Date(customIndex.lastRebalancedAt))
              : "未実施"}
          </span>
        </div>

        <div className="constituent-list">
          {customIndex.members.map((member) => {
            const instrument = instruments.find((item) => item.id === member.instrumentId);
            const replacementCandidates = instruments.filter((item) => !memberIds.includes(item.id));
            const quote = quotesByInstrument[member.instrumentId]
              ?? buildQuoteFromSeries(member.instrumentId, seriesByInstrument[member.instrumentId] ?? [], "finnhub");
            const currentWeight = currentWeights[member.instrumentId] ?? (member.weight / totalWeight) * 100;
            const targetWeight = (member.weight / totalWeight) * 100;
            const weightDrift = currentWeight - targetWeight;
            const changeClass = classForChange(quote?.changePercent ?? 0);
            return (
              <div className="constituent-row" key={member.instrumentId}>
                <div className="constituent-identity">
                  <strong>{instrument?.symbol ?? member.instrumentId}</strong>
                  <small>{instrument?.name ?? "銘柄情報なし"}</small>
                  <div className="constituent-metrics">
                    <span>現在 <strong>{currentWeight.toFixed(2)}%</strong></span>
                    <span>乖離 <strong className={classForChange(weightDrift)}>{weightDrift >= 0 ? "+" : ""}{weightDrift.toFixed(2)}pt</strong></span>
                    <span>1日 <strong className={changeClass}>{quote ? `${quote.changePercent >= 0 ? "+" : ""}${quote.changePercent.toFixed(2)}%` : "--"}</strong></span>
                  </div>
                </div>
                <label className="weight-field">
                  <span>目標ウェイト</span>
                  <div><input type="number" min="0.01" max="100" step="0.01" value={weights[member.instrumentId] ?? ""} onChange={(event) => setWeights((current) => ({ ...current, [member.instrumentId]: event.target.value }))} /><span>%</span></div>
                </label>
                <div className="replacement-control">
                  <select aria-label={`${instrument?.symbol ?? member.instrumentId}の入れ替え先`} value={replacements[member.instrumentId] ?? ""} onChange={(event) => setReplacements((current) => ({ ...current, [member.instrumentId]: event.target.value }))}>
                    <option value="">入れ替え先を選択</option>
                    {replacementCandidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.symbol} / {candidate.name}</option>)}
                  </select>
                  <button className="ghost-button" disabled={!replacements[member.instrumentId]} onClick={() => replaceMember(member.instrumentId)}>入れ替え</button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="rebalance-footer">
          <div>
            <span>合計</span>
            <strong className={totalIsValid ? "" : "invalid"}>{enteredTotal.toFixed(2)}%</strong>
          </div>
          <button className="ghost-button" onClick={setEqualWeights}>均等配分に戻す</button>
          <button className="primary-button" disabled={!validWeights || !totalIsValid} onClick={rebalance}>
            <RefreshCw size={16} />
            リバランスを実行
          </button>
        </div>
        {!totalIsValid ? <p className="form-error">構成比の合計を100%にしてください。</p> : null}
        {feedback ? <p className="index-management-feedback" role="status">{feedback}</p> : null}
      </section>
    </div>
  );
}

function DeleteIndexDialog({
  customIndex,
  onCancel,
  onConfirm
}: {
  customIndex: CustomIndex;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [acknowledged, setAcknowledged] = useState(false);

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-panel delete-index-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-index-title" aria-describedby="delete-index-description">
        <header className="modal-header">
          <div>
            <span className="delete-warning-label"><AlertTriangle size={15} /> Irreversible action</span>
            <h2 id="delete-index-title">オリジナル指数を削除しますか？</h2>
            <p id="delete-index-description">「{customIndex.name}」と、その構成・ウェイト設定が削除されます。この操作は元に戻せません。</p>
          </div>
          <button className="icon-button muted" title="キャンセル" onClick={onCancel}>
            <X size={18} />
          </button>
        </header>

        <div className="delete-index-summary">
          <strong>{customIndex.name}</strong>
          <span>{customIndex.members.length}銘柄 / {customIndex.weighting === "equal" ? "等ウェイト" : "カスタムウェイト"}</span>
        </div>

        <label className="delete-index-acknowledgement">
          <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />
          <span>指数の構成と設定が失われ、元に戻せないことを確認しました。</span>
        </label>

        <div className="delete-index-actions">
          <button className="ghost-button" onClick={onCancel}>キャンセル</button>
          <button className="danger-button" disabled={!acknowledged} onClick={onConfirm}>
            <Trash2 size={16} />
            完全に削除
          </button>
        </div>
      </section>
    </div>
  );
}

function SpaceDialog({
  spaces,
  guilds,
  activeSpaceId,
  loading,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  onClose
}: {
  spaces: SpaceSummary[];
  guilds: DiscordGuild[];
  activeSpaceId: string | null;
  loading: boolean;
  onSelect: (spaceId: string) => void;
  onCreate: (input: { name: string; kind: SpaceKind; guildId: string | null }) => Promise<void>;
  onRename: (spaceId: string, name: string) => Promise<void>;
  onDelete: (space: SpaceSummary, confirmationName: string) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<SpaceKind>("private");
  const [guildId, setGuildId] = useState(guilds[0]?.id ?? "");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [managedSpaceId, setManagedSpaceId] = useState<string | null>(null);
  const [editedName, setEditedName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [dangerOpen, setDangerOpen] = useState(false);
  const [confirmationName, setConfirmationName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const managedSpace = spaces.find((space) => space.id === managedSpaceId && space.role === "owner") ?? null;

  async function createSpace() {
    if (!name.trim()) {
      setError("スペース名を入力してください。");
      return;
    }
    if (kind === "discord_guild" && !guildId) {
      setError("Discordサーバーを選択してください。");
      return;
    }

    setCreating(true);
    setError("");
    try {
      await onCreate({ name: name.trim(), kind, guildId: kind === "discord_guild" ? guildId : null });
      setName("");
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "スペースを作成できませんでした。");
    } finally {
      setCreating(false);
    }
  }

  function openSettings(space: SpaceSummary) {
    if (managedSpaceId === space.id) {
      setManagedSpaceId(null);
      setDangerOpen(false);
      setConfirmationName("");
      setSettingsError("");
      return;
    }

    setManagedSpaceId(space.id);
    setEditedName(space.name);
    setDangerOpen(false);
    setConfirmationName("");
    setSettingsError("");
  }

  async function renameSpace() {
    if (!managedSpace) return;
    const nextName = editedName.trim();
    if (!nextName) {
      setSettingsError("スペース名を入力してください。");
      return;
    }

    setSavingName(true);
    setSettingsError("");
    try {
      await onRename(managedSpace.id, nextName);
      setEditedName(nextName);
    } catch (renameError) {
      setSettingsError(renameError instanceof Error ? renameError.message : "スペース名を変更できませんでした。");
    } finally {
      setSavingName(false);
    }
  }

  async function deleteSpace() {
    if (!managedSpace || confirmationName !== managedSpace.name) return;

    setDeleting(true);
    setSettingsError("");
    try {
      await onDelete(managedSpace, confirmationName);
      setManagedSpaceId(null);
      setDangerOpen(false);
      setConfirmationName("");
    } catch (deleteError) {
      setSettingsError(deleteError instanceof Error ? deleteError.message : "スペースを削除できませんでした。");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-panel space-modal" role="dialog" aria-modal="true" aria-label="スペース管理">
        <header className="modal-header">
          <div>
            <span className="eyebrow">Workspace routing</span>
            <h2>スペースを選択</h2>
            <p>個人用スペース、または所属Discordサーバーの共有スペースへ移動できます。</p>
          </div>
          <button className="icon-button" aria-label="閉じる" onClick={onClose}><X size={18} /></button>
        </header>

        <div className={`space-list ${managedSpace ? "has-settings" : ""}`} aria-label="利用可能なスペース">
          {spaces.map((space) => (
            <div className="space-list-entry" key={space.id}>
              <div className={`space-list-item ${space.id === activeSpaceId ? "active" : ""}`}>
                <button
                  className="space-list-select"
                  onClick={() => {
                    onSelect(space.id);
                    onClose();
                  }}
                >
                  {space.kind === "private" ? <LockKeyhole size={17} /> : <Server size={17} />}
                  <span>
                    <strong>{space.name}</strong>
                    <small>{space.kind === "private" ? "プライベート" : space.guildName}</small>
                  </span>
                </button>
                {space.role === "owner" ? (
                  <button
                    className={`space-settings-button ${managedSpaceId === space.id ? "active" : ""}`}
                    aria-label={`${space.name}の設定`}
                    aria-expanded={managedSpaceId === space.id}
                    aria-controls={`space-settings-${space.id}`}
                    onClick={() => openSettings(space)}
                  >
                    <SlidersHorizontal size={14} />
                    設定
                  </button>
                ) : (
                  <small className="space-role-label">Member</small>
                )}
              </div>

              {managedSpaceId === space.id && managedSpace ? (
                <section
                  id={`space-settings-${space.id}`}
                  className="space-settings-panel"
                  aria-labelledby={`space-settings-title-${space.id}`}
                >
                  <header>
                    <div>
                      <span className="eyebrow">Owner settings</span>
                      <h3 id={`space-settings-title-${space.id}`}>{managedSpace.name} の設定</h3>
                    </div>
                    <span className="owner-only-badge">Owner only</span>
                  </header>

                  <div className="space-rename-row">
                    <label>
                      <span>スペース名</span>
                      <input
                        value={editedName}
                        maxLength={60}
                        onChange={(event) => setEditedName(event.target.value)}
                      />
                    </label>
                    <button
                      className="primary-button"
                      disabled={savingName || !editedName.trim() || editedName.trim() === managedSpace.name}
                      onClick={() => void renameSpace()}
                    >
                      <Save size={16} />
                      {savingName ? "保存中" : "名前を保存"}
                    </button>
                  </div>

                  <div className="space-danger-zone">
                    <div className="space-danger-heading">
                      <span className="delete-warning-label"><AlertTriangle size={15} /> Danger zone</span>
                      <p>スペース内のレイアウトと共有データがすべて削除されます。この操作は元に戻せません。</p>
                    </div>
                    {!dangerOpen ? (
                      <button className="danger-outline-button" onClick={() => setDangerOpen(true)}>
                        <Trash2 size={16} />
                        削除手続きを開く
                      </button>
                    ) : (
                      <div className="space-delete-confirmation">
                        <label>
                          <span>確認のため「<strong>{managedSpace.name}</strong>」と入力してください</span>
                          <input
                            value={confirmationName}
                            autoComplete="off"
                            placeholder={managedSpace.name}
                            onChange={(event) => setConfirmationName(event.target.value)}
                          />
                        </label>
                        <div>
                          <button
                            className="ghost-button"
                            disabled={deleting}
                            onClick={() => {
                              setDangerOpen(false);
                              setConfirmationName("");
                            }}
                          >
                            キャンセル
                          </button>
                          <button
                            className="danger-button"
                            disabled={deleting || confirmationName !== managedSpace.name}
                            onClick={() => void deleteSpace()}
                          >
                            <Trash2 size={16} />
                            {deleting ? "削除中" : "完全に削除"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  {settingsError ? <p className="form-error" role="alert">{settingsError}</p> : null}
                </section>
              ) : null}
            </div>
          ))}
          {!spaces.length && !loading ? <p className="empty-space-message">まだスペースがありません。</p> : null}
        </div>

        <div className="space-create-panel">
          <div>
            <span className="eyebrow">New space</span>
            <h3>スペースを追加</h3>
          </div>
          <label>
            <span>種類</span>
            <select value={kind} onChange={(event) => setKind(event.target.value as SpaceKind)}>
              <option value="private">プライベート</option>
              <option value="discord_guild" disabled={!guilds.length}>Discordサーバー</option>
            </select>
          </label>
          {kind === "discord_guild" ? (
            <label>
              <span>Discordサーバー</span>
              <select value={guildId} onChange={(event) => setGuildId(event.target.value)}>
                {guilds.map((guild) => <option key={guild.id} value={guild.id}>{guild.name}</option>)}
              </select>
            </label>
          ) : null}
          <label>
            <span>スペース名</span>
            <input value={name} maxLength={60} placeholder="例: 長期投資" onChange={(event) => setName(event.target.value)} />
          </label>
          {error ? <p className="form-error">{error}</p> : null}
          <button className="primary-button" disabled={creating || loading} onClick={() => void createSpace()}>
            <Plus size={17} />
            {creating ? "作成中" : "スペースを作成"}
          </button>
        </div>
      </section>
    </div>
  );
}

export function WatchlistApp() {
  const [availableInstruments, setAvailableInstruments] = useState<Instrument[]>(defaultInstruments);
  const [cards, setCards] = useState<WatchCard[]>(initialWatchCards);
  const [customIndexes, setCustomIndexes] = useState<CustomIndex[]>(defaultIndexes);
  const [activeTab, setActiveTab] = useState<"ALL" | MarketRegion>("ALL");
  const [seriesByInstrument, setSeriesByInstrument] = useState<Record<string, SeriesPoint[]>>({});
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [indexOpen, setIndexOpen] = useState(false);
  const [managedIndexId, setManagedIndexId] = useState<string | null>(null);
  const [pendingDeleteIndexId, setPendingDeleteIndexId] = useState<string | null>(null);
  const [compactView, setCompactView] = useState(false);
  const [theme, setTheme] = useState<Theme>("dark");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [quoteOverrides, setQuoteOverrides] = useState<Record<string, Quote>>({});
  const [historyErrors, setHistoryErrors] = useState<Record<string, string>>({});
  const [serverQuoteSource, setServerQuoteSource] = useState<Quote["source"] | null>(null);
  const [snapshotError, setSnapshotError] = useState(false);
  const [marketRefreshNonce, setMarketRefreshNonce] = useState(0);
  const [sessionUser, setSessionUser] = useState<User | null>(null);
  const [spaces, setSpaces] = useState<SpaceSummary[]>([]);
  const [discordGuilds, setDiscordGuilds] = useState<DiscordGuild[]>([]);
  const [activeSpaceId, setActiveSpaceId] = useState<string | null>(null);
  const [spacesLoading, setSpacesLoading] = useState(false);
  const [spaceDialogOpen, setSpaceDialogOpen] = useState(false);
  const [workspaceStatus, setWorkspaceStatus] = useState<"local" | "connecting" | "synced" | "error">("local");
  const [toast, setToast] = useState("");
  const [undoDeletion, setUndoDeletion] = useState<UndoDeletion | null>(null);
  const layoutLoaded = useRef(false);
  const remoteSyncReady = useRef(false);
  const lastSyncedLayoutFingerprint = useRef("");
  const currentLayoutRef = useRef<SavedLayout | null>(null);
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const supabaseReady = isSupabaseBrowserConfigured();
  const activeSpace = spaces.find((space) => space.id === activeSpaceId) ?? null;

  currentLayoutRef.current = createSavedLayout({
    instruments: availableInstruments,
    cards,
    customIndexes,
    compactView,
    activeTab
  });

  function applySharedLayout(layout: SavedLayout, message?: string) {
    setAvailableInstruments(mergeInstruments(layout.instruments));
    setCards(layout.cards);
    setCustomIndexes(layout.customIndexes);
    lastSyncedLayoutFingerprint.current = layoutFingerprint(createSharedLayout(layout));

    if (message) {
      setToast(message);
    }
  }

  function resetToDefaultLayout() {
    setAvailableInstruments(defaultInstruments);
    setCards(initialWatchCards);
    setCustomIndexes(defaultIndexes);
    setCompactView(false);
    setActiveTab("ALL");
    lastSyncedLayoutFingerprint.current = "";
  }

  function switchSpace(spaceId: string, showMessage = true) {
    if (spaceId === activeSpaceId) {
      return;
    }

    remoteSyncReady.current = false;
    lastSyncedLayoutFingerprint.current = "";
    setWorkspaceStatus("connecting");
    setActiveSpaceId(spaceId);

    try {
      window.localStorage.setItem(activeSpaceStorageKey, spaceId);
      const localLayout =
        readSavedLayout(window.localStorage, spaceLayoutStorageKey(spaceId)) ??
        (!activeSpaceId ? readSavedLayout(window.localStorage) : null);
      if (localLayout) {
        applySharedLayout(localLayout);
      } else {
        resetToDefaultLayout();
      }
    } catch {
      resetToDefaultLayout();
    }

    if (showMessage) {
      const destination = spaces.find((space) => space.id === spaceId);
      setToast(destination ? `${destination.name}へ移動しました` : "スペースを切り替えました");
    }
  }

  async function loadSpaces(preferredSpaceId?: string) {
    setSpacesLoading(true);
    try {
      const response = await fetch("/api/spaces", { cache: "no-store" });
      const body = (await response.json()) as SpacesResponse & { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "スペース一覧を取得できませんでした。");
      }

      setSpaces(body.spaces);
      setDiscordGuilds(body.guilds);

      const storedSpaceId = preferredSpaceId ?? window.localStorage.getItem(activeSpaceStorageKey);
      const nextSpace = body.spaces.find((space) => space.id === storedSpaceId) ?? body.spaces[0];
      if (nextSpace) {
        switchSpace(nextSpace.id, false);
      } else {
        remoteSyncReady.current = false;
        setActiveSpaceId(null);
        setWorkspaceStatus("local");
        setSpaceDialogOpen(true);
      }
    } catch (error) {
      setWorkspaceStatus("error");
      setToast(error instanceof Error ? error.message : "スペース一覧を取得できませんでした。");
    } finally {
      setSpacesLoading(false);
    }
  }

  async function createSpace(input: { name: string; kind: SpaceKind; guildId: string | null }) {
    const response = await fetch("/api/spaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    });
    const body = (await response.json()) as { space?: SpaceSummary; error?: string };
    if (!response.ok || !body.space) {
      throw new Error(body.error ?? "スペースを作成できませんでした。");
    }

    await loadSpaces(body.space.id);
    setToast(`${body.space.name}を作成しました`);
  }

  async function renameSpace(spaceId: string, name: string) {
    const response = await fetch(`/api/spaces/${encodeURIComponent(spaceId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    });
    const body = (await response.json()) as { space?: SpaceSummary; error?: string };
    if (!response.ok || !body.space) {
      throw new Error(body.error ?? "スペース名を変更できませんでした。");
    }

    setSpaces((current) => current.map((space) => space.id === spaceId ? body.space! : space));
    setToast(`スペース名を「${body.space.name}」に変更しました`);
  }

  async function deleteSpace(space: SpaceSummary, confirmationName: string) {
    const response = await fetch(`/api/spaces/${encodeURIComponent(space.id)}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmationName })
    });
    const body = (await response.json()) as { deletedSpaceId?: string; error?: string };
    if (!response.ok || body.deletedSpaceId !== space.id) {
      throw new Error(body.error ?? "スペースを削除できませんでした。");
    }

    const remainingSpaces = spaces.filter((item) => item.id !== space.id);
    setSpaces(remainingSpaces);

    try {
      window.localStorage.removeItem(spaceLayoutStorageKey(space.id));
    } catch {
      // The server-side deletion succeeded even if local cleanup is unavailable.
    }

    if (activeSpaceId === space.id) {
      const nextSpace = remainingSpaces[0];
      if (nextSpace) {
        switchSpace(nextSpace.id, false);
      } else {
        remoteSyncReady.current = false;
        lastSyncedLayoutFingerprint.current = "";
        setActiveSpaceId(null);
        setWorkspaceStatus("local");
        resetToDefaultLayout();
        try {
          window.localStorage.removeItem(activeSpaceStorageKey);
        } catch {
          // Keep the empty workspace usable when storage is blocked.
        }
      }
    }

    setToast(`「${space.name}」を削除しました`);
  }

  useEffect(() => {
    const initialTheme = document.documentElement.dataset.theme === "light" ? "light" : "dark";
    setTheme(initialTheme);
    applyDocumentTheme(initialTheme);
  }, []);

  useEffect(() => {
    const savedLayout = readSavedLayout(window.localStorage);

    if (savedLayout) {
      setAvailableInstruments(mergeInstruments(savedLayout.instruments));
      setCards(savedLayout.cards);
      setCustomIndexes(savedLayout.customIndexes);
      setCompactView(savedLayout.compactView);
      setActiveTab(savedLayout.activeTab);
      setToast("Saved layout loaded");
    }

    layoutLoaded.current = true;
  }, []);

  useEffect(() => {
    const authError = new URLSearchParams(window.location.search).get("auth_error");

    if (authError) {
      setToast(`Discord認証エラー: ${authError}`);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    let active = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (active) {
        setSessionUser(data.session?.user ?? null);
      }
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionUser(session?.user ?? null);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (!sessionUser) {
      setSpaces([]);
      setDiscordGuilds([]);
      setActiveSpaceId(null);
      remoteSyncReady.current = false;
      return;
    }

    void loadSpaces();
  }, [sessionUser?.id]);

  useEffect(() => {
    if (!supabase || !sessionUser || !activeSpaceId || !layoutLoaded.current) {
      remoteSyncReady.current = false;
      setWorkspaceStatus("local");
      return;
    }

    const client = supabase;
    const userId = sessionUser.id;
    let cancelled = false;
    setWorkspaceStatus("connecting");

    const channel = client
      .channel(`space:${activeSpaceId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "space_state",
          filter: `space_id=eq.${activeSpaceId}`
        },
        (payload) => {
          const remoteLayout = parseSavedLayout((payload.new as { layout?: unknown }).layout);

          if (!remoteLayout || layoutFingerprint(createSharedLayout(remoteLayout)) === lastSyncedLayoutFingerprint.current) {
            return;
          }

          applySharedLayout(remoteLayout, "共有ワークスペースを同期しました");
          setWorkspaceStatus("synced");
        }
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setWorkspaceStatus("error");
        }
      });

    async function loadSharedWorkspace() {
      const { data, error } = await client
        .from("space_state")
        .select("layout, revision, updated_at")
        .eq("space_id", activeSpaceId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      const remoteLayout = parseSavedLayout(data?.layout);

      if (remoteLayout) {
        applySharedLayout(remoteLayout, "共有ワークスペースを読み込みました");
      } else if (currentLayoutRef.current) {
        const initialLayout = currentLayoutRef.current;
        const { error: updateError } = await client
          .from("space_state")
          .update({
            layout: createSharedLayout(initialLayout),
            revision: Date.now(),
            updated_by: userId,
            updated_at: new Date().toISOString()
          })
          .eq("space_id", activeSpaceId);

        if (updateError) {
          throw updateError;
        }

        lastSyncedLayoutFingerprint.current = layoutFingerprint(createSharedLayout(initialLayout));
      }

      if (!cancelled) {
        remoteSyncReady.current = true;
        setWorkspaceStatus("synced");
      }
    }

    void loadSharedWorkspace().catch((error: unknown) => {
      if (!cancelled) {
        remoteSyncReady.current = false;
        setWorkspaceStatus("error");
        const message = error instanceof Error ? error.message : "unknown error";
        setToast(`共有同期を開始できません: ${message}`);
      }
    });

    return () => {
      cancelled = true;
      remoteSyncReady.current = false;
      void client.removeChannel(channel);
    };
  }, [activeSpaceId, sessionUser?.id, supabase]);

  useEffect(() => {
    if (!layoutLoaded.current) {
      return;
    }

    const layout = createSavedLayout({
      instruments: availableInstruments,
      cards,
      customIndexes,
      compactView,
      activeTab
    });

    try {
      window.localStorage.setItem(spaceLayoutStorageKey(activeSpaceId), JSON.stringify(layout));
    } catch {
      setToast("ローカル保存に失敗しました");
    }

    if (!supabase || !sessionUser || !activeSpaceId || !remoteSyncReady.current) {
      return;
    }

    const sharedLayout = createSharedLayout(layout);
    const fingerprint = layoutFingerprint(sharedLayout);

    if (fingerprint === lastSyncedLayoutFingerprint.current) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void supabase
        .from("space_state")
        .update({
          layout: sharedLayout,
          revision: Date.now(),
          updated_by: sessionUser.id,
          updated_at: new Date().toISOString()
        })
        .eq("space_id", activeSpaceId)
        .then(({ error }) => {
          if (error) {
            setWorkspaceStatus("error");
            setToast(`共有保存に失敗しました: ${error.message}`);
            return;
          }

          lastSyncedLayoutFingerprint.current = fingerprint;
          setWorkspaceStatus("synced");
        });
    }, 700);

    return () => window.clearTimeout(timeout);
  }, [activeSpaceId, activeTab, availableInstruments, cards, compactView, customIndexes, sessionUser, supabase]);

  useEffect(() => {
    let cancelled = false;

    async function loadHistory() {
      const subscribedInstrumentIds = new Set(
        cards.flatMap((card) => {
          if (card.type === "instrument") {
            return [card.refId];
          }

          return customIndexes.find((customIndex) => customIndex.id === card.refId)?.members.map((member) => member.instrumentId) ?? [];
        })
      );
      const subscribedInstruments = Array.from(subscribedInstrumentIds)
        .map((instrumentId) => availableInstruments.find((instrument) => instrument.id === instrumentId))
        .filter((instrument): instrument is Instrument => Boolean(instrument));

      if (!subscribedInstruments.length) {
        return;
      }

      const providerSymbols = subscribedInstruments.map((instrument) => instrument.providerSymbol);
      const response = await fetch(
        `/api/market/history?symbols=${encodeURIComponent(providerSymbols.join(","))}`,
        { cache: "no-store" }
      );

      if (!response.ok) {
        throw new Error(`History request failed: ${response.status}`);
      }

      const payload = (await response.json()) as HistoryResponse;
      const instrumentByProviderSymbol = new Map(
        subscribedInstruments.map((instrument) => [instrument.providerSymbol, instrument])
      );
      const seriesUpdates: Record<string, SeriesPoint[]> = {};
      const quoteUpdates: Record<string, Quote> = {};
      const errorUpdates: Record<string, string> = {};
      let source: Quote["source"] | null = null;

      payload.histories.forEach((history) => {
        const instrument = instrumentByProviderSymbol.get(history.instrumentId);

        if (!instrument) {
          return;
        }

        if (history.quote && history.series.length) {
          seriesUpdates[instrument.id] = history.series;
          quoteUpdates[instrument.id] = {
            ...history.quote,
            instrumentId: instrument.id
          };
          source = history.quote.source;
          return;
        }

        errorUpdates[instrument.id] = history.error ?? "価格データを取得できませんでした。";
      });

      if (cancelled) {
        return;
      }

      setSeriesByInstrument((current) => ({
        ...current,
        ...seriesUpdates
      }));
      setQuoteOverrides((current) => ({
        ...current,
        ...quoteUpdates
      }));
      setHistoryErrors((current) => {
        const next = {
          ...current,
          ...errorUpdates
        };

        Object.keys(seriesUpdates).forEach((instrumentId) => {
          delete next[instrumentId];
        });

        return next;
      });

      if (source) {
        setServerQuoteSource(source);
        setSnapshotError(false);
      }
    }

    void loadHistory().catch(() => {
      if (!cancelled) {
        setSnapshotError(true);
        setHistoryErrors((current) => ({
          ...current,
          ...Object.fromEntries(
            cards
              .filter((card) => card.type === "instrument")
              .map((card) => [card.refId, "価格履歴を取得できませんでした。"])
          )
        }));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [availableInstruments, cards, customIndexes, marketRefreshNonce]);

  useEffect(() => {
    let cancelled = false;

    async function loadSnapshots() {
      const subscribedInstrumentIds = new Set(
        cards.flatMap((card) => {
          if (card.type === "instrument") {
            return [card.refId];
          }

          return customIndexes.find((customIndex) => customIndex.id === card.refId)?.members.map((member) => member.instrumentId) ?? [];
        })
      );
      const subscribedInstruments = Array.from(subscribedInstrumentIds)
        .map((instrumentId) => availableInstruments.find((instrument) => instrument.id === instrumentId))
        .filter(
          (instrument): instrument is Instrument =>
            Boolean(instrument) && instrument?.assetClass === "us_equity"
        );

      if (!subscribedInstruments.length) {
        return;
      }

      const providerSymbols = subscribedInstruments.map((instrument) => instrument.providerSymbol);
      const response = await fetch(
        `/api/market/snapshot?symbols=${encodeURIComponent(providerSymbols.join(","))}`,
        { cache: "no-store" }
      );

      if (!response.ok) {
        throw new Error(`Snapshot request failed: ${response.status}`);
      }

      const payload = (await response.json()) as SnapshotResponse;
      const instrumentByProviderSymbol = new Map(
        subscribedInstruments.map((instrument) => [instrument.providerSymbol, instrument])
      );
      const updates = payload.quotes
        .map((quote) => {
          const instrument = instrumentByProviderSymbol.get(quote.instrumentId);

          if (!instrument || quote.source === "mock" || !Number.isFinite(quote.price) || quote.price <= 0) {
            return null;
          }

          const timestamp = Date.parse(quote.timestamp);
          return {
            instrument,
            quote: {
              ...quote,
              instrumentId: instrument.id
            },
            point: {
              time: Number.isFinite(timestamp) ? timestamp : Date.now(),
              value: formatLivePrice(quote.price)
            }
          };
        })
        .filter(
          (
            update
          ): update is {
            instrument: Instrument;
            quote: Quote;
            point: SeriesPoint;
          } => update !== null
        );

      if (cancelled) {
        return;
      }

      if (!updates.length) {
        return;
      }

      setSnapshotError(false);
      setServerQuoteSource(updates[0].quote.source);
      setQuoteOverrides((current) => ({
        ...current,
        ...Object.fromEntries(updates.map((update) => [update.instrument.id, update.quote]))
      }));
      setSeriesByInstrument((current) => {
        const next = { ...current };

        updates.forEach((update) => {
          const series = next[update.instrument.id];

          if (series?.length) {
            next[update.instrument.id] = appendSeriesPoint(series, update.point);
            return;
          }

          next[update.instrument.id] = buildSeriesFromQuote(update.quote);
        });

        return next;
      });
    }

    if (isUsRegularSession()) {
      void loadSnapshots().catch(() => {
        if (!cancelled) {
          setSnapshotError(true);
        }
      });
    }

    const interval = window.setInterval(() => {
      if (!isUsRegularSession()) {
        return;
      }

      void loadSnapshots().catch(() => {
        if (!cancelled) {
          setSnapshotError(true);
        }
      });
    }, snapshotPollIntervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [availableInstruments, cards, customIndexes, marketRefreshNonce]);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeout = window.setTimeout(() => setToast(""), 3600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (!undoDeletion) {
      return;
    }

    const timeout = window.setTimeout(() => setUndoDeletion(null), 6000);
    return () => window.clearTimeout(timeout);
  }, [undoDeletion]);

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const cardViews = useMemo<MarketCardView[]>(() => {
    const mappedCards = cards
      .map((card): MarketCardView | null => {
        if (card.type === "instrument") {
          const instrument = availableInstruments.find((item) => item.id === card.refId);

          if (!instrument) {
            return null;
          }

          const series = seriesByInstrument[instrument.id] ?? [];
          const quote: Quote | null =
            quoteOverrides[instrument.id] ?? buildQuoteFromSeries(instrument.id, series, "finnhub");

          return {
            id: instrument.id,
            symbol: instrument.symbol,
            name: instrument.name,
            market: instrument.market,
            assetClass: instrument.assetClass,
            currency: instrument.currency,
            providerSymbol: instrument.providerSymbol,
            quote,
            series,
            status: quote && series.length ? "ready" : historyErrors[instrument.id] ? "unavailable" : "loading",
            message: historyErrors[instrument.id]
          };
        }

        const customIndex = customIndexes.find((item) => item.id === card.refId);

        if (!customIndex) {
          return null;
        }

        const series = buildIndexSeries(customIndex, seriesByInstrument);
        const quote = series.length ? buildIndexQuote(customIndex, series, serverQuoteSource ?? "finnhub") : null;
        return {
          id: customIndex.id,
          symbol: customIndex.name,
          name: `${customIndex.members.length}銘柄 / ${customIndex.weighting === "equal" ? "equal weight" : "custom weight"}`,
          market: "CUSTOM" as const,
          assetClass: "custom_index" as const,
          currency: "PAIR" as const,
          quote,
          series,
          status: quote ? "ready" as const : "unavailable" as const,
          message: quote ? undefined : "指数の構成銘柄データを取得できませんでした。"
        };
      })
      .filter((card): card is MarketCardView => card !== null);

    return mappedCards;
  }, [
    availableInstruments,
    cards,
    customIndexes,
    historyErrors,
    quoteOverrides,
    serverQuoteSource,
    seriesByInstrument
  ]);

  const visibleCards = cardViews.filter((card) => activeTab === "ALL" || card.market === activeTab);
  const managedIndex = customIndexes.find((customIndex) => customIndex.id === managedIndexId) ?? null;
  const pendingDeleteIndex = customIndexes.find((customIndex) => customIndex.id === pendingDeleteIndexId) ?? null;
  const existingInstrumentIds = cards
    .filter((card) => card.type === "instrument")
    .map((card) => card.refId);
  const marketDataReady = Boolean(serverQuoteSource);
  const marketDataLabel =
    serverQuoteSource
      ? `${sourceLabels[serverQuoteSource]} shared cache`
      : snapshotError
        ? "Market data error"
        : "Market data loading";
  const workspaceConnected = workspaceStatus === "synced";
  const workspaceStatusLabel = !supabaseReady
    ? "Supabase未設定"
    : !sessionUser
      ? "Discordログイン待ち"
      : spacesLoading
        ? "スペース読込中"
        : !activeSpaceId
          ? "スペース未選択"
      : workspaceStatus === "connecting"
        ? "共有同期中"
        : workspaceStatus === "synced"
          ? "共有同期済み"
          : workspaceStatus === "error"
            ? "共有同期エラー"
            : "ローカル編集";

  async function loginWithDiscord() {
    if (!supabase) {
      setToast("SupabaseのプロジェクトURLとPublishable keyを設定するとDiscord OAuthが有効になります。");
      return;
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "discord",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        scopes: "identify email guilds"
      }
    });

    if (error) {
      setToast(`Discord認証を開始できません: ${error.message}`);
    }
  }

  async function logout() {
    if (!supabase) {
      return;
    }

    const { error } = await supabase.auth.signOut();
    if (error) {
      setToast(`ログアウトに失敗しました: ${error.message}`);
      return;
    }

    setSpaces([]);
    setDiscordGuilds([]);
    setActiveSpaceId(null);
    remoteSyncReady.current = false;
    setToast("Discordからログアウトしました");
  }

  async function toggleFullscreen() {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }

    await document.documentElement.requestFullscreen();
  }

  function renameCard(id: string, name: string) {
    setAvailableInstruments((current) =>
      current.map((instrument) => (instrument.id === id ? { ...instrument, name } : instrument))
    );
    setCustomIndexes((current) =>
      current.map((customIndex) => (customIndex.id === id ? { ...customIndex, name } : customIndex))
    );
  }

  function addInstrument(instrument: Instrument) {
    setAvailableInstruments((current) =>
      current.some((item) => item.id === instrument.id || item.providerSymbol === instrument.providerSymbol)
        ? current
        : [...current, instrument]
    );
    setHistoryErrors((current) => {
      const next = { ...current };
      delete next[instrument.id];
      return next;
    });
    setCards((current) =>
      current.some((card) => card.refId === instrument.id)
        ? current
        : [...current, { id: `card-${instrument.id}`, type: "instrument", refId: instrument.id }]
    );

    if (instrument.assetClass === "jp_equity" && instrument.name === instrument.symbol) {
      void fetch(`/api/market/instrument?providerSymbol=${encodeURIComponent(instrument.providerSymbol)}`)
        .then(async (response) => (response.ok ? ((await response.json()) as InstrumentLookupResponse) : null))
        .then((result) => {
          if (!result?.name) {
            return;
          }

          setAvailableInstruments((current) =>
            current.map((item) => (item.id === instrument.id ? { ...item, name: result.name! } : item))
          );
        })
        .catch(() => {
          // A name lookup is optional; the card remains editable when it fails.
        });
    }
  }

  function toggleTheme() {
    const nextTheme: Theme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    applyDocumentTheme(nextTheme);

    try {
      window.localStorage.setItem(themeStorageKey, nextTheme);
    } catch {
      // The visual switch should still work when storage is unavailable.
    }
  }

  async function saveLayoutNow() {
    const layout = createSavedLayout({
      instruments: availableInstruments,
      cards,
      customIndexes,
      compactView,
      activeTab
    });

    try {
      window.localStorage.setItem(spaceLayoutStorageKey(activeSpaceId), JSON.stringify(layout));
    } catch {
      setToast("ローカル保存に失敗しました");
      return;
    }

    if (!supabase || !sessionUser || !activeSpaceId || !remoteSyncReady.current) {
      setToast("ローカルに保存しました。Discordログイン後は共有保存されます。");
      return;
    }

    const { error } = await supabase
      .from("space_state")
      .update({
        layout: createSharedLayout(layout),
        revision: Date.now(),
        updated_by: sessionUser.id,
        updated_at: new Date().toISOString()
      })
      .eq("space_id", activeSpaceId);

    if (error) {
      setWorkspaceStatus("error");
      setToast(`共有保存に失敗しました: ${error.message}`);
      return;
    }

    lastSyncedLayoutFingerprint.current = layoutFingerprint(createSharedLayout(layout));
    setWorkspaceStatus("synced");
    setToast(`${activeSpace?.name ?? "選択中のスペース"}に保存しました`);
  }

  return (
    <main className={`app-shell ${compactView ? "compact" : ""}`}>
      <header className="workspace-bar">
        <div className="brand-block">
          <div className="brand-mark" aria-hidden="true">
            <span>W/L</span>
            <small>01</small>
          </div>
          <div className="brand-copy">
            <span className="eyebrow">Market intelligence / Tokyo</span>
            <h1>Watch<span>List</span></h1>
            <p>US / Japan / FX — shared market board</p>
          </div>
        </div>

        <div className="workspace-panel">
          <div className="workspace-overview">
            <div className="workspace-chip">
              <span className="section-index">01</span>
              {activeSpace?.kind === "private" ? <LockKeyhole size={15} /> : <Server size={15} />}
              <span>{activeSpace ? `${activeSpace.guildName ? `${activeSpace.guildName} / ` : ""}${activeSpace.name}` : "Local workspace"}</span>
            </div>
            <div className="status-group">
              <div className={`status-pill ${workspaceConnected ? "ready" : ""}`}>
                {workspaceConnected ? <Wifi size={14} /> : <WifiOff size={14} />}
                {workspaceStatusLabel}
              </div>
              <div className={`status-pill ${marketDataReady ? "ready" : ""}`}>
                {marketDataReady ? <Wifi size={14} /> : <WifiOff size={14} />}
                {marketDataLabel}
              </div>
            </div>
          </div>
          <div className="toolbar">
            {sessionUser ? (
              <div className="space-switcher">
                <FolderKanban size={16} />
                <select
                  aria-label="スペースを選択"
                  value={activeSpaceId ?? ""}
                  disabled={spacesLoading || !spaces.length}
                  onChange={(event) => switchSpace(event.target.value)}
                >
                  {!spaces.length ? <option value="">スペースなし</option> : null}
                  {spaces.map((space) => (
                    <option key={space.id} value={space.id}>
                      {space.kind === "private" ? "個人" : space.guildName} · {space.name}
                    </option>
                  ))}
                </select>
                <button className="space-manage-button" onClick={() => setSpaceDialogOpen(true)}>管理</button>
              </div>
            ) : null}
            <button className="ghost-button" onClick={() => void (sessionUser ? logout() : loginWithDiscord())}>
              <LogIn size={16} />
              {sessionUser ? "Logout" : "Discord"}
            </button>
            <button className="ghost-button" onClick={() => void saveLayoutNow()}>
              <Save size={16} />
              Save
            </button>
            <button className="ghost-button" onClick={() => setIndexOpen(true)}>
              <BarChart3 size={16} />
              指数
            </button>
            <button className="primary-button" onClick={() => setAddOpen(true)}>
              <Plus size={16} />
              追加
            </button>
          </div>
        </div>
      </header>

      <section className="control-strip">
        <div className="filter-group">
          <span className="section-index">02</span>
          <nav className="tabs" aria-label="watchlist filters">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                className={activeTab === tab.key ? "active" : ""}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
        <div className="view-actions">
          <button
            className="theme-toggle"
            type="button"
            aria-label="ライトモード"
            aria-pressed={theme === "light"}
            title={theme === "dark" ? "ライトモード" : "ダークモード"}
            onClick={toggleTheme}
          >
            {theme === "dark" ? <Moon size={15} /> : <Sun size={15} />}
            <span>{theme === "dark" ? "Dark" : "Light"}</span>
          </button>
          <button
            className="icon-button muted"
            aria-label={isFullscreen ? "全画面を終了" : "全画面表示"}
            title={isFullscreen ? "全画面を終了" : "全画面表示"}
            onClick={() => void toggleFullscreen()}
          >
            <Square size={15} />
          </button>
          <button
            className={`icon-button muted ${compactView ? "active" : ""}`}
            aria-label={compactView ? "標準表示" : "縮小表示"}
            title={compactView ? "標準表示" : "縮小表示"}
            onClick={() => setCompactView((current) => !current)}
          >
            <Minimize2 size={16} />
          </button>
          <button
            className="icon-button muted"
            aria-label="更新"
            title="更新"
            onClick={() => {
              setMarketRefreshNonce((current) => current + 1);
              setToast("共有価格キャッシュを再確認しています。");
            }}
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </section>

      <section className="market-grid">
        {visibleCards.map((card) => (
          <MarketCard
            key={card.id}
            card={card}
            dragging={draggingId === card.id}
            onRemove={(id) => {
              if (customIndexes.some((customIndex) => customIndex.id === id)) {
                setPendingDeleteIndexId(id);
                return;
              }

              const deletedCardPosition = cards.findIndex((card) => card.refId === id || card.id === id);
              const deletedCard = cards[deletedCardPosition];
              const deletedInstrument = availableInstruments.find((instrument) => instrument.id === id);
              setCards((current) =>
                current.filter((watchCard) => !(watchCard.refId === id || watchCard.id === id))
              );
              if (deletedCard) {
                setUndoDeletion({
                  message: `「${deletedInstrument?.name ?? deletedInstrument?.symbol ?? id}」を削除しました。`,
                  card: deletedCard,
                  cardPosition: deletedCardPosition
                });
              }
            }}
            onManageIndex={setManagedIndexId}
            onRename={renameCard}
            onDragStart={(id) => setDraggingId(id)}
            onDragEnter={(overId) => {
              if (!draggingId || draggingId === overId) {
                return;
              }

              setCards((current) => reorderCards(current, `card-${draggingId}`, `card-${overId}`));
            }}
            onDragEnd={() => setDraggingId(null)}
          />
        ))}
      </section>

      {addOpen ? (
        <AddInstrumentDialog
          availableInstruments={availableInstruments}
          existingInstrumentIds={existingInstrumentIds}
          onClose={() => setAddOpen(false)}
          onAdd={addInstrument}
        />
      ) : null}

      {indexOpen ? (
        <IndexDialog
          cards={cardViews}
          onClose={() => setIndexOpen(false)}
          onCreate={(customIndex) => {
            setCustomIndexes((current) => [...current, customIndex]);
            setCards((current) => [
              ...current,
              { id: `card-${customIndex.id}`, type: "index", refId: customIndex.id }
            ]);
            setManagedIndexId(customIndex.id);
          }}
        />
      ) : null}

      {managedIndex ? (
        <IndexManagementDialog
          customIndex={managedIndex}
          instruments={availableInstruments}
          quotesByInstrument={quoteOverrides}
          seriesByInstrument={seriesByInstrument}
          onClose={() => setManagedIndexId(null)}
          onUpdate={(updatedIndex) => {
            setCustomIndexes((current) =>
              current.map((customIndex) => customIndex.id === updatedIndex.id ? updatedIndex : customIndex)
            );
          }}
        />
      ) : null}

      {pendingDeleteIndex ? (
        <DeleteIndexDialog
          customIndex={pendingDeleteIndex}
          onCancel={() => setPendingDeleteIndexId(null)}
          onConfirm={() => {
            const deletedCardPosition = cards.findIndex((card) => card.refId === pendingDeleteIndex.id);
            const deletedCard = cards[deletedCardPosition];
            const deletedIndexPosition = customIndexes.findIndex((customIndex) => customIndex.id === pendingDeleteIndex.id);
            setCards((current) => current.filter((card) => card.refId !== pendingDeleteIndex.id));
            setCustomIndexes((current) => current.filter((customIndex) => customIndex.id !== pendingDeleteIndex.id));
            setManagedIndexId((current) => current === pendingDeleteIndex.id ? null : current);
            setPendingDeleteIndexId(null);
            if (deletedCard) {
              setUndoDeletion({
                message: `「${pendingDeleteIndex.name}」を削除しました。`,
                card: deletedCard,
                cardPosition: deletedCardPosition,
                customIndex: pendingDeleteIndex,
                indexPosition: deletedIndexPosition
              });
            }
          }}
        />
      ) : null}

      {spaceDialogOpen && sessionUser ? (
        <SpaceDialog
          spaces={spaces}
          guilds={discordGuilds}
          activeSpaceId={activeSpaceId}
          loading={spacesLoading}
          onSelect={switchSpace}
          onCreate={createSpace}
          onRename={renameSpace}
          onDelete={deleteSpace}
          onClose={() => setSpaceDialogOpen(false)}
        />
      ) : null}

      {undoDeletion ? (
        <div className="toast undo-toast" role="status" aria-live="polite">
          <span>{undoDeletion.message}</span>
          <button
            onClick={() => {
              setCards((current) => {
                if (current.some((card) => card.id === undoDeletion.card.id)) {
                  return current;
                }
                const next = [...current];
                next.splice(Math.min(Math.max(undoDeletion.cardPosition, 0), next.length), 0, undoDeletion.card);
                return next;
              });
              if (undoDeletion.customIndex) {
                setCustomIndexes((current) => {
                  if (current.some((customIndex) => customIndex.id === undoDeletion.customIndex?.id)) {
                    return current;
                  }
                  const next = [...current];
                  next.splice(
                    Math.min(Math.max(undoDeletion.indexPosition ?? next.length, 0), next.length),
                    0,
                    undoDeletion.customIndex!
                  );
                  return next;
                });
              }
              setUndoDeletion(null);
              setToast("削除を取り消しました。");
            }}
          >
            <Undo2 size={15} />
            取り消す
          </button>
        </div>
      ) : toast ? <div className="toast" role="status" aria-live="polite">{toast}</div> : null}
    </main>
  );
}
