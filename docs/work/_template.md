# <ID> · <short title>

**Agent:** <cursor-1 | cursor-2 | claude> · **Branch:** `ui/<ID>-<slug>` · **Worktree:** `../btw-gd-<ID>` · **Port:** <52xx>
**Approved:** no   <!-- the human changes this to "yes" before any code -->

## Goal
One or two sentences: what will look or work differently for the user.

## Issues
IDs from `docs/22-ui-cleanup.md` (or a new feature doc): S-1, S-2, …

## Files I will touch
Only files this row owns on the board. List anything else under "Requests" on the board.
- `path/to/file.svelte`: what changes

## Steps
1. …
2. …

## Test plan
| Issue | How it is checked (test file / screenshot) | Fails before? |
|---|---|---|
| | | |

## Out of scope
What this row will **not** do (and which row will).

## Done when
- [ ] Each issue above is fixed, or moved with a reason, and has a Fix log row
- [ ] `pnpm check:text && pnpm check && pnpm test && pnpm build && pnpm size` pass
- [ ] Screenshots before/after (light + dark; 390 px for shell/login) listed below

## Fix log
Write a row when each fix lands. Result: ✅ passing · ❌ failing (paste the output) · ⏭ moved (say where).
| Date | Issue | Cause | Change (files) | Test | Result |
|---|---|---|---|---|---|

## Screenshots
| Screen | Before | After |
|---|---|---|

## Handover
Fill this in when you stop before done (AGENTS.md §6). The next agent starts here.
- **Last commit:** `<sha> wip(<ID>): …`
- **Done:** …
- **Half-done:** file:line, what is left in it
- **Next step:** the exact next action
- **Run first:** commands to check the state
- **Failing checks:** command + output
- **Open questions:** …

## Report
`<ID>: done … | blocked on … | left …`
