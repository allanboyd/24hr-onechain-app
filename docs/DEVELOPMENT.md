# Development process

## One-time setup
```bash
nvm use                      # Node 20.16+ (.nvmrc); Node 22 LTS lets us move to Vite 8
corepack enable              # gives the pinned pnpm (packageManager in package.json)
pnpm install                 # also generates packages/tokens/tokens.css
pnpm mockups:setup           # downloads the headless browser used for mockups (~115 MB, once)
```

## Daily loop
| Command | What it does |
|---|---|
| `pnpm dev` | Web on http://localhost:5173 and field app on http://localhost:5174 with hot reload |
| `pnpm verify` | Everything CI runs: tokens → type-check (warnings fail) → workflow test → build → size budget |
| `pnpm mockups` | Starts the dev servers if needed, runs every flow in `tools/mockups/flows/`, rebuilds the review gallery at `mockups/gallery/index.html` (≈2½ min) |
| `pnpm mockups --only B,D` | Re-capture just some areas (the gallery keeps the others) |
| `pnpm api:test` | API type-check + HTTP end-to-end test against a migrated, seeded DB (Docker must be running) |
| `pnpm --filter @btw/server test:integrations` | SMS/USSD parser, email to Mailpit, PDFs, files, routing |
| `pnpm --filter @btw/web test:http` | Web click-through against the running API |
| `pnpm android:build` | Debug APK (`JAVA_HOME=$HOME/.local/opt/jdk-21 ANDROID_HOME=$HOME/Android/Sdk`; one-time `bash scripts/setup-android.sh`) |
| `pnpm test` | Only the plan → PO → load → checkpoints → acknowledge → stock → sale test (`packages/api/test/workflow.e2e.ts`) |

## Changing a screen
1. Branch from `main` (`feat/<area>-<thing>`, e.g. `feat/field-ack-undo`).
2. Change the screen. Screens import only `@btw/api` and `@btw/ui`; colours and sizes come from tokens only (`docs/design-system/tokens.json` → `pnpm tokens`).
3. If the change adds a screen or state, add a `shot(...)` to the matching flow (prefix A–E, notes say what it shows and which requirement IDs it covers).
4. A business rule change goes into `packages/api/src/rules.ts` (shared by the mock, the http client and the server) **plus** a check in `packages/api/test/workflow.e2e.ts` and, for API behaviour, `apps/api/test/api.e2e.ts`.
5. `pnpm verify` and `pnpm mockups` must both pass (the mockup run fails on any console error).
6. Open a PR. CI repeats both and attaches the gallery as a downloadable artifact.

## Review loop
- The shared review board is a claude.ai artifact (Approve / Needs changes + note per screen). After `pnpm mockups`, ask Claude to republish `mockups/gallery` to the same link; verdicts are kept because they are stored by screen id (the file name, e.g. `E04-field-ack-sign`). Keep ids stable when re-capturing; renaming a shot orphans its review.
- To act on feedback, ask Claude to read the review board; it lists the "Needs changes" notes per screen.

## Layout
```
apps/web, apps/field      the two apps (separate builds)
apps/api                  NestJS API, migrations, seed, API + integration tests
packages/api              contract types, shared rules, mock + http clients, offline outbox, workflow test
packages/ui, tokens       shared components and generated design tokens
tools/mockups             snap helper, flows A–E, gallery builder and template
scripts/                  token generator, size budget
docs/                     requirements, design system, MVP plan, API contract, this file
mockups/ (git-ignored)    generated screenshots and gallery
```
