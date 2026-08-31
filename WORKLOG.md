# Worklog

## 2026-08-30

- Added a Goodreads title-lookup fallback for `/pick` when Goodreads serves an empty WAF challenge, preserving book titles and source links for blocked pages.
- Consolidated the server's split PM2 state into one system-managed daemon, eliminating duplicate Dewey processes that competed to respond to Discord interactions.

## 2026-08-25

- Made monthly reminder catch-up materialize every active due month from its tracking baseline, including across December, while a December first start begins tracking in January to avoid replaying November.
- Made unavailable or invalid configured reminder channels consume the normal durable retry/backoff workflow after claiming work.
- Added a durable, retryable SQLite queue for third-failure admin alerts and corrected late-December send-date rendering.
- Raised the Node engine floor and setup documentation to Node 22.13, where `node:sqlite` no longer needs the experimental flag.
- Moved the reminder channel from persisted schedule data and `/setchannel` to required `REMINDER_CHANNEL_ID` configuration; retained member, rotation, and exclusion migration behavior.
- Documented SQLite first-start migration and backup files, Discord-only live-data operations, durable late/retry reminders, third-attempt admin alerts, and scheduler diagnostics.
- Moved schedule persistence to SQLite with one-time transactional import from `data/schedule.json`; the JSON backup is preserved unchanged and command-facing schedule reads/writes retain their existing API.
- Made incomplete first-run SQLite migrations retry safely, and updated member-assignment guidance to use `/addmember`.
- Preserved populated pre-marker SQLite schedules during startup, preventing stale JSON backups from overwriting them.
- Made new installs initialize an empty SQLite schedule without creating a JSON example backup.
- Made `AGENTS.md` the tool-neutral canonical agent instruction file and reduced `CLAUDE.md` to a compatibility pointer, so unavailable Claude-specific plugins do not block Codex diagnosis or routine work.

## 2026-05-06

- Smarter deploy: when `package-lock.json` is unchanged, skip the stop/npm ci/start cycle and use a fast `pm2 restart` instead; full stop/install/start still runs when deps change or on manual dispatch

## 2026-04-28

- Added `/help` command — lists all available commands with descriptions, ephemeral (only visible to the invoker), and filters out admin-only commands for non-admin users

## 2026-04-07

- Added `WORKLOG.md` to track ongoing work on the project
- Added test infrastructure (Vitest) with initial tests for core rotation logic (`activeMonthDistance`, `nextActiveYearMonth`, `getActiveMonthWindow`)
- Added `/current` command to show the current month's assigned picker and book
- Updated `CLAUDE.md` to require updating `WORKLOG.md` and running/writing tests after changes
- Fixed Discord client startup by switching to `clientReady` event

## 2026-03-27

- Added book source links to `/next` previews — shows Goodreads, Amazon, Audible, Libby, and Hoopla links for any picked book with a scraped title
- Added admin coverage reminders: on the 15th, the bot now notifies the admin if the next 3 active months are not all assigned
- Added Raspberry Pi auto-deploy workflow via GitHub Actions self-hosted runner — pushes to `main` now automatically pull, build, and restart via PM2

## 2026-02-21

- Removed `data/schedule.json` from git tracking (added to `.gitignore`) — live schedule data no longer conflicts with pulls
- Improved `/randomize`: now overrides non-pinned, non-book-picked slots in the window (true reshuffle), and enforces a 3-active-month spacing between any two picks by the same member
- Added Goodreads title scraping — `/pick` auto-fetches the book title from the Goodreads URL and stores it alongside the link
- Added `/addmember` command for adding members via Discord instead of editing JSON directly
- Added `/randomize <month> <year>` parameter to start the randomization window from a specific month; added `/swap` command to swap two members' assigned months
- Switched from calendar-year rotation to an 11-month rolling rotation (December is always skipped, schedule spans across years)
- Dewey 1.0 — initial release with core commands: `/schedule`, `/next`, `/history`, `/pick`, `/assign`, `/pin`, `/unpin`, `/exclude`, `/unexclude`, `/randomize`, `/setchannel`; mid-month reminders on the 15th
