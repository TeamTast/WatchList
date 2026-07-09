"use client";

import {
  BarChart3,
  GripVertical,
  LogIn,
  Minimize2,
  Plus,
  RefreshCw,
  Search,
  Square,
  Trash2,
  Wifi,
  WifiOff,
  X
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { buildIndexQuote, buildIndexSeries } from "@/lib/market/index-builder";
import {
  defaultIndexes,
  defaultWatchCards,
  instruments,
  makeQuote,
  makeSeries,
  tickSeries
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

function formatChange(quote: Quote) {
  const sign = quote.change >= 0 ? "+" : "";
  return `${sign}${quote.change.toFixed(Math.abs(quote.change) > 10 ? 1 : 2)} / ${sign}${quote.changePercent.toFixed(2)}%`;
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

function Sparkline({ series, tone }: { series: SeriesPoint[]; tone: "positive" | "negative" | "neutral" }) {
  const width = 420;
  const height = 128;
  const padding = 10;
  const values = series.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const line = series
    .map((point, index) => {
      const x = padding + (index / Math.max(series.length - 1, 1)) * (width - padding * 2);
      const y = height - padding - ((point.value - min) / range) * (height - padding * 2);
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  const area = `${line} L${width - padding},${height - padding} L${padding},${height - padding} Z`;

  return (
    <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="price chart">
      <path d={area} fill={`var(--${tone})`} opacity="0.08" />
      <path d={line} fill="none" stroke={`var(--${tone})`} strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}

function MarketCard({
  card,
  dragging,
  onRemove,
  onDragStart,
  onDragEnter,
  onDragEnd
}: {
  card: MarketCardView;
  dragging: boolean;
  onRemove: (id: string) => void;
  onDragStart: (id: string) => void;
  onDragEnter: (id: string) => void;
  onDragEnd: () => void;
}) {
  const changeClass = classForChange(card.quote.change);

  return (
    <article
      className={`market-card ${dragging ? "dragging" : ""}`}
      draggable
      onDragStart={() => onDragStart(card.id)}
      onDragEnter={() => onDragEnter(card.id)}
      onDragOver={(event) => event.preventDefault()}
      onDragEnd={onDragEnd}
      onDrop={onDragEnd}
    >
      <header className="card-top">
        <button className="icon-button muted drag-handle" title="並べ替え">
          <GripVertical size={17} />
        </button>
        <div className="symbol-block">
          <div className="symbol-row">
            <strong>{card.symbol}</strong>
            <span className={`market-pill ${card.market.toLowerCase()}`}>{marketLabels[card.market]}</span>
          </div>
          <span>{card.name}</span>
        </div>
        <button className="icon-button danger" title="削除" onClick={() => onRemove(card.id)}>
          <Trash2 size={16} />
        </button>
      </header>

      <div className="price-row">
        <div>
          <span className="price">{formatPrice(card.quote.price, card.currency)}</span>
          <span className="currency">{card.currency === "PAIR" ? "" : card.currency}</span>
        </div>
        <span className={`change ${changeClass}`}>{formatChange(card.quote)}</span>
      </div>

      <Sparkline series={card.series} tone={changeClass} />

      <footer className="card-meta">
        <span>{assetLabels[card.assetClass]}</span>
        <span>H {formatPrice(card.quote.dayHigh, card.currency)}</span>
        <span>L {formatPrice(card.quote.dayLow, card.currency)}</span>
      </footer>
    </article>
  );
}

function AddInstrumentDialog({
  existingInstrumentIds,
  onClose,
  onAdd
}: {
  existingInstrumentIds: string[];
  onClose: () => void;
  onAdd: (instrument: Instrument) => void;
}) {
  const [query, setQuery] = useState("");
  const candidates = instruments.filter((instrument) => {
    if (existingInstrumentIds.includes(instrument.id)) {
      return false;
    }

    const haystack = `${instrument.symbol} ${instrument.name} ${instrument.providerSymbol}`.toLowerCase();
    return haystack.includes(query.toLowerCase());
  });

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
            placeholder="AAPL, 7203, USDJPY..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        <div className="candidate-list">
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
  const [cards, setCards] = useState<WatchCard[]>([
    ...defaultWatchCards,
    { id: "card-idx-ai-us", type: "index", refId: "idx-ai-us" }
  ]);
  const [customIndexes, setCustomIndexes] = useState<CustomIndex[]>(defaultIndexes);
  const [activeTab, setActiveTab] = useState<"ALL" | MarketRegion>("ALL");
  const [seriesByInstrument, setSeriesByInstrument] = useState<Record<string, SeriesPoint[]>>(() =>
    Object.fromEntries(instruments.map((instrument) => [instrument.id, makeSeries(instrument.id)]))
  );
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [indexOpen, setIndexOpen] = useState(false);
  const [compactView, setCompactView] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [toast, setToast] = useState("");
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const supabaseReady = isSupabaseBrowserConfigured();

  useEffect(() => {
    const interval = window.setInterval(() => {
      setSeriesByInstrument((current) =>
        Object.fromEntries(
          Object.entries(current).map(([instrumentId, series]) => [
            instrumentId,
            tickSeries(instrumentId, series)
          ])
        )
      );
    }, 2600);

    return () => window.clearInterval(interval);
  }, []);

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
          const instrument = instruments.find((item) => item.id === card.refId);

          if (!instrument) {
            return null;
          }

          const series = seriesByInstrument[instrument.id] ?? makeSeries(instrument.id);
          return {
            id: instrument.id,
            symbol: instrument.symbol,
            name: instrument.name,
            market: instrument.market,
            assetClass: instrument.assetClass,
            currency: instrument.currency,
            providerSymbol: instrument.providerSymbol,
            quote: makeQuote(instrument.id, series),
            series
          };
        }

        const customIndex = customIndexes.find((item) => item.id === card.refId);

        if (!customIndex) {
          return null;
        }

        const series = buildIndexSeries(customIndex, seriesByInstrument);
        return {
          id: customIndex.id,
          symbol: customIndex.name,
          name: `${customIndex.members.length}銘柄 / equal weight`,
          market: "CUSTOM" as const,
          assetClass: "custom_index" as const,
          currency: "PAIR" as const,
          quote: buildIndexQuote(customIndex, series),
          series
        };
      })
      .filter((card): card is MarketCardView => card !== null);

    return mappedCards;
  }, [cards, customIndexes, seriesByInstrument]);

  const visibleCards = cardViews.filter((card) => activeTab === "ALL" || card.market === activeTab);
  const existingInstrumentIds = cards
    .filter((card) => card.type === "instrument")
    .map((card) => card.refId);

  async function loginWithDiscord() {
    if (!supabase) {
      setToast("Supabase環境変数を設定するとDiscord OAuthが有効になります。");
      return;
    }

    await supabase.auth.signInWithOAuth({
      provider: "discord",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`
      }
    });
  }

  async function toggleFullscreen() {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }

    await document.documentElement.requestFullscreen();
  }

  return (
    <main className={`app-shell ${compactView ? "compact" : ""}`}>
      <section className="workspace-bar">
        <div className="brand-block">
          <div className="brand-mark">
            <BarChart3 size={23} />
          </div>
          <div>
            <h1>WatchList</h1>
            <p>US / Japan / FX market board</p>
          </div>
        </div>

        <div className="toolbar">
          <div className="workspace-chip">
            <span>Shared Market Desk</span>
            <div className="avatar-stack" aria-label="team members">
              <span title="K">K</span>
              <span title="M">M</span>
              <span title="R">R</span>
            </div>
          </div>
          <div className={`status-pill ${supabaseReady ? "ready" : ""}`}>
            {supabaseReady ? <Wifi size={15} /> : <WifiOff size={15} />}
            {supabaseReady ? "Sync ready" : "Demo mode"}
          </div>
          <button className="ghost-button" onClick={loginWithDiscord}>
            <LogIn size={17} />
            Discord
          </button>
          <button className="ghost-button" onClick={() => setIndexOpen(true)}>
            <BarChart3 size={17} />
            指数
          </button>
          <button className="primary-button" onClick={() => setAddOpen(true)}>
            <Plus size={17} />
            追加
          </button>
        </div>
      </section>

      <section className="control-strip">
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
        <div className="view-actions">
          <button
            className="icon-button muted"
            title={isFullscreen ? "全画面を終了" : "全画面表示"}
            onClick={() => void toggleFullscreen()}
          >
            <Square size={15} />
          </button>
          <button
            className={`icon-button muted ${compactView ? "active" : ""}`}
            title={compactView ? "標準表示" : "縮小表示"}
            onClick={() => setCompactView((current) => !current)}
          >
            <Minimize2 size={16} />
          </button>
          <button className="icon-button muted" title="更新" onClick={() => setToast("価格を再取得しました。")}>
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
          existingInstrumentIds={existingInstrumentIds}
          onClose={() => setAddOpen(false)}
          onAdd={(instrument) => {
            setCards((current) => [
              ...current,
              { id: `card-${instrument.id}`, type: "instrument", refId: instrument.id }
            ]);
            setSeriesByInstrument((current) => ({
              ...current,
              [instrument.id]: current[instrument.id] ?? makeSeries(instrument.id)
            }));
          }}
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

      {toast ? <div className="toast">{toast}</div> : null}
    </main>
  );
}
