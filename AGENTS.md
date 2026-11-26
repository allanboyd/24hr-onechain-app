# BTW platform: rules for every agent (Claude Code, Cursor, anyone)

Read this first. `CLAUDE.md` and `.cursor/rules/agents.mdc` both point here, so every tool follows the same rules.

## 1. Plan before code
No code change starts without a **plan file** that the human has approved.

1. Open [`docs/work/BOARD.md`](docs/work/BOARD.md). Pick a row that is `⬜ open` and whose **Depends** rows are `✅ done`.
2. Copy [`docs/work/_template.md`](docs/work/_template.md) to `docs/work/plans/<ID>.md` and fill it in: goal, issue IDs, files you will touch, steps, done-when, out of scope.
3. On the board, set your row to `📝 planned` and put your agent name in **Agent** (e.g. `cursor-1`, `cursor-2`, `claude`). Commit only those two files on `main`: `chore(board): plan <ID>`.
   If the commit or push conflicts on `BOARD.md`, someone else claimed it first. Pull, and pick another row.
4. Wait for the human to write `Approved: yes` in the plan file. Then set your row to `🔄 in progress`.

Small fixes (one file, under ~20 lines, no new behaviour) can skip steps 2 and 4, but they still get a board row.

## 2. Work in your own worktree and branch
```bash
git worktree add ../btw-gd-<ID> -b <prefix>/<ID>-<slug> <base>   # e.g. ../btw-gd-V3-2  v3/V3-2-management design-v3
cd ../btw-gd-<ID> && pnpm install
```
- `<base>` is the **base branch named in your board section** (`design-v3` for V3 rows, `main` for UI rows). Claim, rebase and merge against that branch, not `main`.
- Never work on `main` directly, and never in another agent's worktree.
- **The main checkout runs the shared stack** (`pnpm work`: API :3101, web :5173, field :5174). Don't stop it.
- To see your branch, run its web app on **your own port** against the shared API (the `/v1` proxy goes to :3101):
  `VITE_API=http VITE_API_URL=/v1 pnpm --filter @btw/web exec vite --port <port> --strictPort`
  Ports: UI-0 5210 · UI-1 5211 · UI-2 5212 · UI-3 5213 · UI-4 5214 · UI-5 5215 · UI-6 5216 (field app: 5220 + n).
- UI streams don't change the API or the database. If you need to, ask on the board (Requests).

## 3. Own your files
- The board lists the files each row **owns**. Edit only those files.
- You need a change in a file you don't own? Add a line under **Requests** on the board (`UI-3 → UI-0: need a wide prop on Field`). Meanwhile, keep a local workaround and mark it `// TODO(<ID>): replace with …`. Never wait idle.
- **Shared files** (only the row that owns them, or the human): `AGENTS.md`, `package.json`, `pnpm-lock.yaml`, `docs/design-system/tokens.json`, `packages/ui/src/base.css`, `packages/api/**`, `apps/api/**`, `apps/web/src/routes.ts`, `apps/web/src/App.svelte`.
- On `BOARD.md`, edit only **your own row** and add lines under **Requests** / **Log**.

## 4. Project rules (summary; details in `docs/DEVELOPMENT.md`)
- Screens import only `@btw/api` and `@btw/ui`. Colours, sizes and radii come from tokens (`docs/design-system/tokens.json` → `pnpm tokens`), never hard-coded hex.
- Icons: `@lucide/svelte/icons/<name>`, 18 px in nav and buttons, 16 px inline.
- Product text: plain, short, sentence case. **No em dashes (—)**. Empty cells show `-`. No spec codes in UI text (`pnpm check:text`).
- Dashboards: follow `.cursor/rules/dashboards-home.mdc`.
- Business rules live in `packages/api/src/rules.ts`, with a test.
- Size budgets: web entry 130 KB, phone entry 90 KB (`pnpm size`).

## 5. Tests and fixes
- **Test plan first.** The plan file lists how each issue will be checked: an automated test (unit, `apps/web/test`, `packages/api/test`, QA suite) where behaviour changes, or a screenshot check where only the look changes.
- **Bug fixes start with a failing check.** Reproduce the bug (a test, or a screenshot showing it), then fix, then show the check passing.
- **Fix log.** Every fix goes in the plan file's *Fix log* table: issue ID, what was wrong (cause), what changed, how it was tested, and the result. Write the row when the fix lands, not at the end.
- **Bugs you find but don't own:** add a `BUG-<n>` line under **Bugs found** on the board (where, steps, screenshot), so it can get its own row. Don't fix it in passing.
- A failing check you can't fix: leave it failing, write it in the Fix log as `❌` with the output, and say so in your report. Never skip or delete a test to make the run pass.

## 6. Handover (tokens running out, rate limit, session ending, switching agent)
Any agent can stop at any time and the next one must be able to continue **without asking anything**. Hand over as soon as one of these happens:
- your context or tokens are close to full (Claude: the conversation is getting long or was summarized; Cursor: near the context limit),
- you hit a rate limit or usage cap, or the human says stop or switch,
- you are blocked for more than a few minutes on something you can't change.

Steps (≈ 2 minutes, do them before anything else):
1. **Commit work in progress** on your branch, even if it doesn't build: `wip(<ID>): handover - <one line>`. Push if the branch has a remote.
2. Fill the **Handover** section of your plan file: what is done, what is half-done (file and line), the exact next step, commands to run, failing checks with their output, and decisions still open.
3. Set your board row to `⏸ handed over` and add a Log line.
4. Report: `<ID>: handover | done … | next … | worktree ../btw-gd-<ID>`.

**Taking over:** read the plan file (Handover section first), then `git log main..` on the branch. Run the checks before changing anything. Put your name in **Agent** and set the row back to `🔄 in progress`.

## 7. Done means
- `pnpm check:text && pnpm check && pnpm test && pnpm build && pnpm size` pass in your worktree.
- Before/after screenshots of every changed screen are listed in your plan file (light + dark; 390 px wide for shell and login).
- Every issue ID in your plan is fixed, or moved with a reason, and has a row in the Fix log.
- Rebase on your base branch, then set your row to `👀 review` with the branch name.
  - Base `main`: the human reviews and merges.
  - Base is a feature line (e.g. `design-v3`): once the checks pass, the agent merges the row into the line (`--no-ff`), so it shows on the shared stack the human reviews. The human then sets `✅ done` or asks for changes, and only the human merges the line into `main`.
- Clean up: `git worktree remove ../btw-gd-<ID>` after the merge.

## 8. Report back in one line
`<ID>: done <issue IDs> | blocked on <what> | left <issue IDs>`. Example: `UI-3: done F-1 F-2 F-4 | blocked on UI-0 Field wide prop | left F-7`.

## 9. Commits
Conventional style, scoped to the stream: `feat(ui-shell): account menu in the top bar (S-2)`. One issue ID or more in each message. Don't commit `.env`, secrets, `mockups/`, or `node_modules/`.
