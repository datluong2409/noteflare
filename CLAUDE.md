# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

NoteFlare: end-to-end encrypted, Google Keep–style notes on one Cloudflare Worker (Hono API + static React app) with D1. Package manager is Bun; CI also uses Node 22.

## Commands

```bash
bun install
cp dev.vars.sample .dev.vars          # DEV_USER_EMAIL for local login (only works with empty Access vars on localhost)
bun run db:migrate:local
bun run dev:api                       # Worker + local D1 on :8787
bun run dev                           # Vite on :5173, proxies /api

bun run typecheck                     # tsc -b plus packages/client
bun run test                          # vitest run (all)
bunx vitest run tests/merge.test.ts   # single test file
bunx vitest run -t "name"             # single test by name
bun run build                         # tsc -b && vite build
bun run build:client                  # builds packages/client SDK
bun run deploy                        # build, wrangler deploy, remote migrations
bun run release -- patch              # cut a version from CHANGELOG (--dry-run to preview)
```

CI (and PR checklist) runs: typecheck, test, build, build:client.

The service worker (`src/sw/sw.js`) exists only in production builds; to test offline mode run `bun run build && bun run dev:api` and open :8787.

## Architecture

Read `docs/ARCHITECTURE.md` for the full picture. Key points that span files:

- **All crypto, merging and sync happen in the browser**; the server stores opaque ciphertext. Only `pinned`, `archived`, `trashed_at`, `position`, `version` and timestamps are plaintext. Search is client-side.
- **`packages/client` is the single source of truth** for wire types, crypto (`crypto.ts`), three-way merge (`merge.ts`) and the SDK. The web app, the Worker (via `shared/types.ts`) and `packages/cli` all import it. Don't duplicate crypto logic elsewhere.
- **Worker (`worker/index.ts`, Hono)** mounts the same API twice: `/api` (Cloudflare Access session, full power incl. vault and tokens) and `/api/v1` (Bearer `nf_…` tokens only, CORS `*`, can't touch vault or tokens). `worker/auth.ts` verifies the Access JWT itself; `worker/tokens.ts` handles hashed personal access tokens. POSTs must be `application/json`; responses are `no-store`.
- **Offline-first sync (`src/lib/sync/engine.ts`, `localStore.ts`)**: UI reads/writes IndexedDB; edits are encrypted, debounced (700 ms) into an outbox and pushed with optimistic concurrency (`baseVersion`; server returns 409 with current note). On 409 the engine three-way merges; unresolvable same-line clashes become a "conflict copy" note.
- **Vault (`src/lib/vault.tsx`)**: passphrase → Argon2id → KEK wraps a random DEK; recovery code → HKDF wraps it too. DEK is a non-extractable CryptoKey in memory only. Per-note AAD is `note:<id>`; image blobs use `blob:<id>`.
- **Version** comes from `package.json` via `shared/version.ts`; `CHANGELOG.md` is bundled into the app and parsed by `shared/release.ts` (shared with `scripts/`).
- Optional R2 image attachments are enabled by uncommenting `r2_buckets` in `wrangler.jsonc`.

## Conventions and gotchas

- Style: strict TypeScript, two-space indent, single quotes, no semicolons. Conventional Commits.
- **Every new UI string needs a key in both `src/i18n/en.ts` (source of truth) and `src/i18n/vi.ts`.** New languages must be registered in `src/i18n/index.tsx`.
- **DB changes only via a new numbered file in `migrations/`**; never edit a shipped migration.
- **`/api/v1` is public and must stay backward compatible**: add fields, don't rename/remove; update `worker/openapi.ts` and `docs/API.md` together with route changes.
- Security-sensitive files (`packages/client/src/crypto.ts`, `worker/auth.ts`, `worker/tokens.ts`, note wire format): never send plaintext, passphrase or DEK to the server/logs; don't lower the KDF floor or change AAD strings without a migration path; prefer WebCrypto over new deps.
- Motion goes through `src/lib/motion.ts` (respects reduced motion); use color tokens from `src/index.css`, not hard-coded colors.
- Add a Vitest test in `tests/` for logic changes (sync tests use `fake-indexeddb`) and a CHANGELOG "Unreleased" entry for user-visible changes.
- `DEV_USER_EMAIL` must never be set in production.
