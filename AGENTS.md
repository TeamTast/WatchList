# WatchList agent guide

## Purpose and project map

- Build a production-ready shared market watchlist with Next.js App Router, React, strict TypeScript, Supabase, and server-side market data. Prefer cohesive changes over speculative rewrites.
- `app/` owns pages and routes; `components/` interactive UI; `lib/market/` providers, caching, and indexes; `lib/supabase/` client boundaries; `data/` ordered migrations.
- Treat `README.md` as the product-behavior reference. For visual work, follow `design.md`, especially its agent protocol and acceptance checklist.

## Working agreement

- For review, diagnosis, explanation, or planning requests: inspect and report; do not edit unless the user also asks for changes.
- For build, fix, refactor, or change requests: make the requested in-scope local changes and run relevant non-destructive validation without asking first.
- Ask before adding or updating dependencies, changing a lockfile for dependency reasons, applying database migrations, making external writes, running destructive commands, or materially expanding scope.
- Preserve unrelated user changes, inspect the current diff, and keep patches focused.
- Search with `rg` before reading. Read symbols and targeted ranges instead of dumping large files; `components/watchlist-app.tsx` and `app/globals.css` are especially large.
- Exclude `.next/`, `node_modules/`, `coverage/`, and `dist/` from exploration. Reuse existing types and helpers; avoid unrelated cleanup.

## Engineering invariants

- Keep TypeScript strict and preserve the `@/*` alias. Avoid `any`, unjustified suppression, and silent error swallowing.
- Preserve App Router server/client boundaries. Keep secret-bearing clients, provider calls, and privileged Supabase operations server-only.
- Never print or expose `.env.local`, `SUPABASE_SECRET_KEY`, or market-provider API keys. Use `.env.example` for variable names and documentation. Inspect secret values only when the user explicitly authorizes a narrowly scoped diagnosis.
- Preserve the documented server-side market access, shared caching, request coalescing, and cache windows.
- Keep loading, empty, error, delayed, disabled, and responsive states coherent. UI changes require real visual inspection, not code review alone.
- Keep SQL migrations additive and ordered. Do not apply them to a live Supabase project without explicit authorization.
- Do not modify dependencies or `package-lock.json` during ordinary feature work. Restore dependencies from the lockfile only when needed.

## Validation and handoff

- This workspace uses PowerShell: run npm through `npm.cmd`, not `npm`, to avoid the local script-execution-policy failure.
- Use scripts declared in `package.json`; do not invent commands. When present, prefer `npm.cmd run check` as the fast gate and `npm.cmd run verify` before handoff.
- For TypeScript changes, at minimum run `npm.cmd run typecheck`. For route, configuration, behavior, or substantial refactor changes, also run `npm.cmd run build` when a broader verification script is unavailable.
- For UI changes, inspect `http://127.0.0.1:3000` at desktop and mobile sizes, including browser errors and interaction.
- Finish with `git diff --check` and `git status --short`. Report what changed, which validations ran, and any remaining risk; never claim a check that did not run.

## Agent and context budget

- Keep small or tightly coupled work single-agent.
- Delegate only bounded, independent, read-heavy work when parallelism materially helps. Use at most two workers and spawn depth one.
- Do not assign concurrent edits to the same file or tightly coupled code path. Parallel writers create conflicts and usually cost more than they save.
- Workers should return distilled evidence with file and symbol references, not raw logs or repeated parent context.
- Keep instructions and summaries concise, avoid rereading unchanged files, and rerun only the narrowest command needed to resolve a failure.
