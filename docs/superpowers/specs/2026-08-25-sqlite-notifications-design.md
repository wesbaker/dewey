# SQLite Persistence and Durable Notifications Design

## Goal

Move Dewey's live schedule from JSON to SQLite and ensure the monthly Discord
reminder survives process downtime and transient Discord failures.

## Persistence

`data/dewey.sqlite` is the source of truth. On its first use, Dewey imports
the existing `data/schedule.json` in a single SQLite transaction, then leaves
the JSON file unchanged as a recovery backup. The import is logged only after
the transaction commits. Existing commands continue to use `readSchedule()`
and `writeSchedule()`; their implementation moves from filesystem JSON to
SQLite transactions.

If no JSON backup exists, initialization creates the schema and leaves the
schedule empty; members and rotation entries can then be added through Discord
commands.

The schema preserves the existing schedule concepts in `settings`, `members`,
`rotation`, and `exclusions` tables. SQLite runs in WAL mode with a busy
timeout. Dewey uses Node's built-in `node:sqlite`, requiring Node 22.5 or
newer; production already runs Node 22.22.0.

## Notification delivery

The `notifications` table is separate from schedule data. It has a unique
logical key (`mid-month:YYYY-MM`), its intended month, due timestamp, status,
attempt count, next-attempt timestamp, last error, lease timestamp, and Discord
message ID.

On the 15th at the configured hour, on client startup, and at a short polling
interval, Dewey creates or finds the current-month reminder and drains due
work. The unique key and SQLite claim transaction prevent normal duplicate
sends. Each message identifies both the intended month and actual send date;
late work is sent rather than discarded, including work from a previous month.

Sending is at-least-once: Discord and SQLite cannot share one transaction, so
a crash after Discord accepts a message but before Dewey records its message ID
can cause a duplicate retry. Successful sends record the Discord message ID.
Failures use exponential backoff. After the third failed attempt, Dewey sends
an admin alert, while retaining the original notification for later retries.

## Observability and safety

Every worker run logs its trigger, claimed key, send attempt, successful
Discord message ID, and failures. Channel fetch and message send failures are
caught explicitly. Database, WAL, and shared-memory files are gitignored;
the original JSON is retained until production verification is complete.

## Verification

Tests cover one-time JSON import, schedule round trips, idempotent queueing,
late work, send success, send failure/backoff, and third-failure admin alerts.
The complete Vitest suite and TypeScript check must pass before deployment.
