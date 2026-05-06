# Worklog

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
