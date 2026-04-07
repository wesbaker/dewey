# Claude Code Instructions

## After making changes

- Always update `README.md` to reflect any new or changed commands, features, or setup instructions.
- Update `WORKLOG.md` with a dated entry summarizing what changed in this session.
- Run `npm install` after adding or removing packages to keep `package-lock.json` in sync, then commit it alongside `package.json`. Prefer packages that don't use platform-specific native bindings (e.g. avoid vitest 4.x which uses rolldown) — the lock file is generated on macOS and must work on Linux CI runners too.
- Run `npx tsc --noEmit` to verify the project type-checks cleanly before finishing.
- Run `npm test` to verify all tests pass.
- When adding new pure logic (rotation math, data transformations), add tests in the corresponding `*.test.ts` file.

## Project conventions

- Commands are loaded dynamically from `src/commands/` — drop a new `.ts` file in and it auto-registers.
- `Command` interface `data` field must accept `SlashCommandBuilder | SlashCommandOptionsOnlyBuilder` (discord.js v14 quirk).
- Admin-only commands use the `adminOnly: true` flag on the command export.
- The admin user ID is `286876274037882880` (Wes) — used in `/pick` for admin overrides.
- All data is persisted to `data/schedule.json` — no database.
- Reads/writes are synchronous (file is tiny). Every command reads fresh from disk so hand-edits work without restart.
- ESM throughout (`"type": "module"` in package.json). Use `fileURLToPath(import.meta.url)` for `__dirname` equivalent.
- PM2 ecosystem file must be `.cjs`.
- Months are integers 1–11 (December is always skipped). `RotationSlot` has `year` + `month`.
- `/randomize` fills gaps only — never overwrites existing assignments.
