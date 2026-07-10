# WatchList

少人数が1つの共有ワークスペースを編集するマーケットウォッチリストです。価格取得をサーバー側へ集約し、全利用者が同じキャッシュ済み価格とチャート履歴を参照します。

## Setup

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local` and fill Supabase values when enabling auth.

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
MARKET_DATA_PROVIDER=mock
FINNHUB_API_KEY=
EODHD_API_KEY=
MASSIVE_API_KEY=
```

## Supabase

1. Create a Supabase project.
   `NEXT_PUBLIC_SUPABASE_URL` には `https://<project-ref>.supabase.co` だけを設定し、`/rest/v1` などのパスは付けません。
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` には Project Settings > API Keys の Publishable key（`sb_publishable_...`）を設定します。Secret key（`sb_secret_...`）はブラウザへ公開しないでください。
2. Supabase Dashboardの Authentication > Sign In / Providers でDiscordを有効化し、DiscordのClient ID / Client Secretを保存します。
3. Discord Developer PortalのOAuth2 Redirectsには、Supabase画面に表示される `https://<project-ref>.supabase.co/auth/v1/callback` を登録します。アプリの `/auth/callback` ではありません。
4. `data/supabase-schema.sql`、続けて `data/shared-workspace-migration.sql` をSupabase SQL Editorで実行します。
5. SupabaseのURL ConfigurationでSite URLを設定し、Redirect URLsへ `http://127.0.0.1:3000/auth/callback` と本番の `https://<host>/auth/callback` を追加します。
6. 利用者をDiscordだけに限定する場合は、SupabaseのほかのSign In Providerを無効にします。

## Market Data Strategy

- `MARKET_DATA_PROVIDER=finnhub` と `FINNHUB_API_KEY` をサーバー環境変数へ設定すると、`/api/market/snapshot` が価格を取得します。APIキーはブラウザへ公開しません。
- 価格は60秒、チャート履歴は15分キャッシュされます。同じ銘柄構成の同時リクエストは1回の外部API呼び出しへまとめられます。
- ブラウザは60秒ごとに共有キャッシュを確認します。各利用者からFinnhub WebSocketへ直接接続しません。
- 履歴の取得時刻は15分境界へ揃えているため、全利用者へ同じチャート系列を返します。
- US stocks use symbols like `AAPL`; FX uses OANDA-style symbols like `OANDA:USD_JPY`; Japan equities try `.T` symbols like `7203.T` and fall back to demo data if realtime is not available.
- The API routes do not return dummy data when a provider is missing or a symbol has no data; the card stays in loading/no-data state.
- `/api/market/snapshot` normalizes Finnhub REST snapshots when `MARKET_DATA_PROVIDER=finnhub`, and EODHD snapshots when `MARKET_DATA_PROVIDER=eodhd`.
- サーバーが複数インスタンスに分かれる環境でもNext.jsのfetch/CDNキャッシュを利用します。インスタンス内ではさらに同時リクエストをsingle-flightします。

## Current MVP

- Discordログイン済み利用者は全員 `Shared Market Desk` の同じレイアウトを編集し、Supabase Realtimeで反映されます。
- 未ログイン時や同期障害時はローカル保存を継続します。
- Discord認証の開始・コールバック交換・共有DB接続のエラーは画面上に表示されます。
- Original indexes are equal-weighted from selected visible instruments with a 1000 base value.
- Deployment probe: 2026-07-09.
