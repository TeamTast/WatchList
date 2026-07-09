# WatchList

Discord OAuthで友達と共有編集できるマーケットウォッチリストのMVPです。Home画面はダークテーマの4列チャートグリッドで、銘柄追加、削除、ドラッグ並べ替え、オリジナル指数作成をデモデータで触れます。

## Setup

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local` and fill Supabase values when enabling auth.

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_MARKET_DATA_PROVIDER=mock
NEXT_PUBLIC_FINNHUB_API_KEY=
MARKET_DATA_PROVIDER=mock
FINNHUB_API_KEY=
EODHD_API_KEY=
MASSIVE_API_KEY=
```

## Supabase

1. Create a Supabase project.
2. Enable Discord in Auth Providers.
3. Set the Discord callback URL in the Discord Developer Portal to the Supabase callback URL shown in Supabase.
4. Run `data/supabase-schema.sql` in the Supabase SQL editor.
5. Set site URL to the deployed app URL and add `http://127.0.0.1:3000/auth/callback` for local development.

## Market Data Strategy

- Free-first market data uses Finnhub REST snapshots through `/api/market/snapshot` when `MARKET_DATA_PROVIDER=finnhub` and `FINNHUB_API_KEY` are set.
- On page load, `/api/market/history` fetches Finnhub candles and renders charts from real historical data.
- Higher-frequency browser WebSocket updates are enabled when `NEXT_PUBLIC_MARKET_DATA_PROVIDER=finnhub` and `NEXT_PUBLIC_FINNHUB_API_KEY` are also set.
- US stocks use symbols like `AAPL`; FX uses OANDA-style symbols like `OANDA:USD_JPY`; Japan equities try `.T` symbols like `7203.T` and fall back to demo data if realtime is not available.
- The API routes do not return dummy data when a provider is missing or a symbol has no data; the card stays in loading/no-data state.
- `/api/market/snapshot` normalizes Finnhub REST snapshots when `MARKET_DATA_PROVIDER=finnhub`, and EODHD snapshots when `MARKET_DATA_PROVIDER=eodhd`.
- For a public production app, prefer server-side snapshots or a server relay. `NEXT_PUBLIC_FINNHUB_API_KEY` is visible to browsers and should be treated as a friends/private MVP option.

## Current MVP

- Local demo data updates every few seconds. Finnhub snapshots or live trades replace the demo ticks when configured.
- Discord button activates when Supabase env vars are set.
- Watchlist ordering and edits are in local React state until wired to Supabase tables.
- Original indexes are equal-weighted from selected visible instruments with a 1000 base value.
- Deployment probe: 2026-07-09.
