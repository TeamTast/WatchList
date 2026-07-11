# WatchList

少人数が1つの共有ワークスペースを編集するマーケットウォッチリストです。価格取得をサーバー側へ集約し、全利用者が同じキャッシュ済み価格とチャート履歴を参照します。

## Setup

```bash
npm ci
npm run dev
```

## Development

Node.js 22.16以降とnpm 10以降を使用します。lockfileどおりに環境を作るときは `npm ci` を使ってください。Windows PowerShellでは実行ポリシーによる `npm.ps1` の失敗を避けるため、エージェントと手動検証のどちらも `npm.cmd` を使います。

```powershell
npm.cmd ci
npm.cmd run dev
npm.cmd run check
npm.cmd run verify
```

- `check`: Node標準テストランナーの単体テストとTypeScript型検査
- `verify`: `check` に加えてNext.js本番ビルド
- 依存追加・更新は明示的な作業として行い、通常の実装では `package.json` と `package-lock.json` を変更しません。

Codexはリポジトリをtrustedとして開くと [`.codex/config.toml`](./.codex/config.toml) を読み込み、[`AGENTS.md`](./AGENTS.md) の短いプロジェクト指示に従います。既定はGPT-5.6のmedium reasoning、Standard相当の実行、最大3エージェントです。小さな変更は単一エージェントで処理し、独立した調査や検証だけを並列化します。

Copy `.env.example` to `.env.local` and fill Supabase values when enabling auth.

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
MARKET_DATA_PROVIDER=mock
FINNHUB_API_KEY=
EODHD_API_KEY=
MASSIVE_API_KEY=
```

## Supabase

1. Create a Supabase project.
   `NEXT_PUBLIC_SUPABASE_URL` には `https://<project-ref>.supabase.co` だけを設定し、`/rest/v1` などのパスは付けません。
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` には Project Settings > API Keys の Publishable key（`sb_publishable_...`）を設定します。
   `SUPABASE_SECRET_KEY` には Secret key（`sb_secret_...`）を設定します。このキーはDiscord所属確認後のメンバー登録にだけサーバー側で使い、`NEXT_PUBLIC_` を付けないでください。
2. Supabase Dashboardの Authentication > Sign In / Providers でDiscordを有効化し、DiscordのClient ID / Client Secretを保存します。
3. Discord Developer PortalのOAuth2 Redirectsには、Supabase画面に表示される `https://<project-ref>.supabase.co/auth/v1/callback` を登録します。アプリの `/auth/callback` ではありません。
4. `data/supabase-schema.sql`、`data/shared-workspace-migration.sql`、`data/spaces-migration.sql` の順にSupabase SQL Editorで実行します。
5. SupabaseのURL ConfigurationでSite URLを設定し、Redirect URLsへ `http://127.0.0.1:3000/auth/callback` と本番の `https://<host>/auth/callback` を追加します。
6. 利用者をDiscordだけに限定する場合は、SupabaseのほかのSign In Providerを無効にします。

Discord認証では `identify email guilds` スコープを要求します。既存のログインセッションは一度ログアウトし、再ログインして所属サーバー一覧へのアクセスを許可してください。サーバー配下には複数の共有スペースを、個人には複数のプライベートスペースを作成できます。

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
