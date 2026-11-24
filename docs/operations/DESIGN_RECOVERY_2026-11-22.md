# Design recovery — 22 November 2026 baseline

**Programme:** ZIRICAI design recovery (Spencer / Astra)  
**Baseline SHA:** `9374e1babf1442e8f38e48f920447b8e8c3b39f8` (`design-baseline-2026-11-22`)  
**Stage 2 closed:** 2026-11-25

## Strategy applied

**22 November visual shell + functionality developed after 22 November** — no whole-repo rollback.

| Layer | Action |
|--------|--------|
| Sarah App shell (`design-system.css`, `icons.css`, `index.html` links) | Matches `9374e1b` (no drift) |
| Sarah App behaviour | Kept `2b8f388`+ (fast chat, company thread prime, Babes/CM media in `thread-rich-text.js`) |
| Regressed UX (dual Chats, Sarah avatars, News loader HTML) | Restored in `8aa3859` on top of above |
| Client Portal Sach / Discover upload | **Retained** (post–22-Nov product work) |
| Railway API | **Untouched** — `origin/main` through `beaae3f` |

## Verification (automated)

- `prototype/sarah-app-ux/css/design-system.css` — **byte-identical** to `9374e1b`.
- `prototype/sarah-app-ux/css/icons.css` — unchanged since baseline.
- `prototype/sarah-app-ux/js/thread-rich-text.js` — **≥ `2b8f388`** (Babes + dealer-image proxy).
- `npm run prepare:users` — shell completeness assert passes.

## Reference worktree

Detached checkout for visual diff only:

`git worktree list` → `.design-recovery-9374e1b` @ `9374e1b`

Remove when finished: `git worktree remove .design-recovery-9374e1b`

## Stash

Prepare-sites noise stashed before Stage 2: `git stash list` → `pre-design-recovery-2026-11-25`

## UAT (Spencer)

1. Hard-refresh `sarah.ziricai.com` (SW v94+).
2. Chats: **Business chats** + **Sarah chats** sections; Sarah avatar on Sarah rows.
3. News: animated loader (not plain text).
4. Bell inbox: Sarah image on Work / reminders / Sarah-labelled items.
5. Babes / Central Motors: vehicle photos in company chat.

## Rule

Local Cursor rule: `.cursor/rules/sarah-app-ux-preservation.mdc` (gitignored) — do not regress Sarah App CSS/UX without explicit approval.