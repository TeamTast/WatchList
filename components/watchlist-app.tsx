"use client";

import {
  BarChart3,
  GripVertical,
  LogIn,
  Minimize2,
  Moon,
  Plus,
  RefreshCw,
  Save,
  Search,
  Square,
  Sun,
  Trash2,
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
import { createSupabaseBrowserClient, isSupabaseBrowserConfigured } from "@/lib/supabase/client";

const tabs: Array<{ key: "ALL" | MarketRegion; label: string }> = [
  { key: "ALL", label: "All" },
  { key: "US", label: "米国株" },
  { key: "JP", label: "日本株" },
  { key: "FX", label: "FX" },
  { key: "CUSTOM", label: "指数" }
];

const marketLabels: Record<MarketRegion, string> = {
  US: "US",
  JP: "JP",
  FX: "FX",
  CUSTOM: "IDX"
};

const assetLabels: Record<AssetClass, string> = {
  us_equity: "Stock",
  jp_equity: "Stock",
  fx: "FX",
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
const themeStorageKey = "watchlist.theme.v1";
const sharedWorkspaceKey = "shared-market-desk";
const snapshotPollIntervalMs = 60_000;

type Theme = "dark" | "light";

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
  if (currency === "JPY") {
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
  return value === "US" || value === "JP" || value === "FX" || value === "CUSTOM";
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
    (value.assetClass === "us_equity" || value.assetClass === "jp_equity" || value.assetClass === "fx") &&
    isMarketRegion(value.market) &&
    (value.currency === "USD" || value.currency === "JPY" || value.currency === "PAIR")
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

function readSavedLayout(storage: Storage): SavedLayout | null {
  const rawLayout = storage.getItem(layoutStorageKey);

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

function layoutFingerprint(layout: SavedLayout) {
  return JSON.stringify({
    instruments: layout.instruments,
    cards: layout.cards,
    customIndexes: layout.customIndexes,
    compactView: layout.compactView,
    activeTab: layout.activeTab
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
  const [activeTime, setActiveTime] = useState<number | null>(null);
  const [calloutHorizontal, setCalloutHorizontal] = useState<"left" | "right">("right");
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
  const calloutVertical = activePoint && activePoint.y < height / 2 ? "top" : "bottom";
  const calloutAnchor = `${calloutVertical}-${calloutHorizontal}`;
  const leaderAnchorY = calloutVertical === "top" ? 24 : height - 24;
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

  function updateCalloutGeometry(pointX: number) {
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

    setCalloutHorizontal((current) => current === resolvedSide ? current : resolvedSide);
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

    updateCalloutGeometry(nearest.x);
    setActiveTime((current) => current === nearest.point.time ? current : nearest.point.time);
  }

  function selectPointAt(index: number) {
    const point = points[Math.max(0, Math.min(points.length - 1, index))];

    if (point) {
      updateCalloutGeometry(point.x);
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
        onBlur={() => setActiveTime(null)}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            const currentIndex = activeIndex >= 0 ? activeIndex : points.length - 1;
            selectPointAt(currentIndex + (event.key === "ArrowLeft" ? -1 : 1));
          } else if (event.key === "Home" || event.key === "End") {
            event.preventDefault();
            selectPointAt(event.key === "Home" ? 0 : points.length - 1);
          } else if (event.key === "Escape") {
            setActiveTime(null);
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
            setActiveTime(null);
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
            className={`chart-callout ${calloutAnchor}`}
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
  onRename,
  onDragStart,
  onDragEnter,
  onDragEnd
}: {
  card: MarketCardView;
  dragging: boolean;
  onRemove: (id: string) => void;
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
                <strong>{card.symbol}</strong>
                <span className={`market-pill ${card.market.toLowerCase()}`}>{marketLabels[card.market]}</span>
              </div>
              <EditableCardName name={card.name} onRename={(name) => onRename(card.id, name)} />
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
        <button className="icon-button danger" title="削除" onClick={() => onRemove(card.id)}>
          <Trash2 size={16} />
        </button>
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
              members: selected.map((instrumentId) => ({ instrumentId, weight: 1 }))
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

export function WatchlistApp() {
  const [availableInstruments, setAvailableInstruments] = useState<Instrument[]>(defaultInstruments);
  const [cards, setCards] = useState<WatchCard[]>(initialWatchCards);
  const [customIndexes, setCustomIndexes] = useState<CustomIndex[]>(defaultIndexes);
  const [activeTab, setActiveTab] = useState<"ALL" | MarketRegion>("ALL");
  const [seriesByInstrument, setSeriesByInstrument] = useState<Record<string, SeriesPoint[]>>({});
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [indexOpen, setIndexOpen] = useState(false);
  const [compactView, setCompactView] = useState(false);
  const [theme, setTheme] = useState<Theme>("dark");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [quoteOverrides, setQuoteOverrides] = useState<Record<string, Quote>>({});
  const [historyErrors, setHistoryErrors] = useState<Record<string, string>>({});
  const [serverQuoteSource, setServerQuoteSource] = useState<Quote["source"] | null>(null);
  const [snapshotError, setSnapshotError] = useState(false);
  const [marketRefreshNonce, setMarketRefreshNonce] = useState(0);
  const [sessionUser, setSessionUser] = useState<User | null>(null);
  const [workspaceStatus, setWorkspaceStatus] = useState<"local" | "connecting" | "synced" | "error">("local");
  const [toast, setToast] = useState("");
  const layoutLoaded = useRef(false);
  const remoteSyncReady = useRef(false);
  const lastSyncedLayoutFingerprint = useRef("");
  const currentLayoutRef = useRef<SavedLayout | null>(null);
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const supabaseReady = isSupabaseBrowserConfigured();

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
    setCompactView(layout.compactView);
    setActiveTab(layout.activeTab);
    lastSyncedLayoutFingerprint.current = layoutFingerprint(layout);

    if (message) {
      setToast(message);
    }
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
    if (!supabase || !sessionUser || !layoutLoaded.current) {
      remoteSyncReady.current = false;
      setWorkspaceStatus("local");
      return;
    }

    const client = supabase;
    const userId = sessionUser.id;
    let cancelled = false;
    setWorkspaceStatus("connecting");

    const channel = client
      .channel(`workspace:${sharedWorkspaceKey}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "shared_workspace_state",
          filter: `workspace_key=eq.${sharedWorkspaceKey}`
        },
        (payload) => {
          const remoteLayout = parseSavedLayout((payload.new as { layout?: unknown }).layout);

          if (!remoteLayout || layoutFingerprint(remoteLayout) === lastSyncedLayoutFingerprint.current) {
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
        .from("shared_workspace_state")
        .select("layout, revision, updated_at")
        .eq("workspace_key", sharedWorkspaceKey)
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
          .from("shared_workspace_state")
          .update({
            layout: initialLayout,
            revision: Date.now(),
            updated_by: userId,
            updated_at: new Date().toISOString()
          })
          .eq("workspace_key", sharedWorkspaceKey);

        if (updateError) {
          throw updateError;
        }

        lastSyncedLayoutFingerprint.current = layoutFingerprint(initialLayout);
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
  }, [sessionUser?.id, supabase]);

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
      window.localStorage.setItem(layoutStorageKey, JSON.stringify(layout));
    } catch {
      setToast("ローカル保存に失敗しました");
    }

    if (!supabase || !sessionUser || !remoteSyncReady.current) {
      return;
    }

    const fingerprint = layoutFingerprint(layout);

    if (fingerprint === lastSyncedLayoutFingerprint.current) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void supabase
        .from("shared_workspace_state")
        .update({
          layout,
          revision: Date.now(),
          updated_by: sessionUser.id,
          updated_at: new Date().toISOString()
        })
        .eq("workspace_key", sharedWorkspaceKey)
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
  }, [activeTab, availableInstruments, cards, compactView, customIndexes, sessionUser, supabase]);

  useEffect(() => {
    let cancelled = false;

    async function loadHistory() {
      const subscribedInstruments = cards
        .filter((card) => card.type === "instrument")
        .map((card) => availableInstruments.find((instrument) => instrument.id === card.refId))
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
  }, [availableInstruments, cards, marketRefreshNonce]);

  useEffect(() => {
    let cancelled = false;

    async function loadSnapshots() {
      const subscribedInstruments = cards
        .filter((card) => card.type === "instrument")
        .map((card) => availableInstruments.find((instrument) => instrument.id === card.refId))
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
  }, [availableInstruments, cards, marketRefreshNonce]);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeout = window.setTimeout(() => setToast(""), 3600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

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
          name: `${customIndex.members.length}銘柄 / equal weight`,
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
        scopes: "identify email"
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
      window.localStorage.setItem(layoutStorageKey, JSON.stringify(layout));
    } catch {
      setToast("ローカル保存に失敗しました");
      return;
    }

    if (!supabase || !sessionUser || !remoteSyncReady.current) {
      setToast("ローカルに保存しました。Discordログイン後は共有保存されます。");
      return;
    }

    const { error } = await supabase
      .from("shared_workspace_state")
      .update({
        layout,
        revision: Date.now(),
        updated_by: sessionUser.id,
        updated_at: new Date().toISOString()
      })
      .eq("workspace_key", sharedWorkspaceKey);

    if (error) {
      setWorkspaceStatus("error");
      setToast(`共有保存に失敗しました: ${error.message}`);
      return;
    }

    lastSyncedLayoutFingerprint.current = layoutFingerprint(layout);
    setWorkspaceStatus("synced");
    setToast("共有ワークスペースに保存しました");
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
              <span>Shared Market Desk</span>
              <div className="avatar-stack" aria-label="team members">
                <span title="K">K</span>
                <span title="M">M</span>
                <span title="R">R</span>
              </div>
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
            onRemove={(id) =>
              setCards((current) =>
                current.filter((watchCard) => !(watchCard.refId === id || watchCard.id === id))
              )
            }
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
          }}
        />
      ) : null}

      {toast ? <div className="toast" role="status" aria-live="polite">{toast}</div> : null}
    </main>
  );
}
