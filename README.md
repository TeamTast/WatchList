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
MARKET_DATA_PROVIDER=mock
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

- US stocks and FX should use a server-side WebSocket relay for high-frequency updates.
- Japan equities start with delayed/global snapshot data, then move to a licensed real-time JP feed when budget and license are ready.
- The API route at `/api/market/snapshot` already normalizes EODHD-style REST snapshots when `MARKET_DATA_PROVIDER=eodhd`.
- Keep provider keys server-side. Browser clients should subscribe to your own realtime channel or server-sent stream, not vendor sockets directly.

## Current MVP

- Local demo data updates every few seconds.
- Discord button activates when Supabase env vars are set.
- Watchlist ordering and edits are in local React state until wired to Supabase tables.
- Original indexes are equal-weighted from selected visible instruments with a 1000 base value.
- Deployment probe: 2026-07-09.
