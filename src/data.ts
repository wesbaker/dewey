import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Exclusion, Member, RotationSlot, Schedule } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_DIRECTORY = resolve(__dirname, "../data");
const IMPORT_COMPLETE_KEY = "schedule_import_complete";
const NOTIFICATION_TRACKING_BASELINE_MONTH_KEY =
  "notification_tracking_baseline_month";

interface MemberRow {
  discord_id: string;
  name: string;
}

interface RotationRow {
  year: number;
  month: number;
  member_id: string;
  pin: number;
  book_url: string | null;
  book_title: string | null;
}

interface ExclusionRow {
  member_id: string;
  month: number;
}

function dataDirectory(): string {
  return process.env.DEWEY_DATA_DIR ?? DEFAULT_DATA_DIRECTORY;
}

function paths() {
  const directory = dataDirectory();
  return {
    database: resolve(directory, "dewey.sqlite"),
    schedule: resolve(directory, "schedule.json"),
  };
}

function openDatabase(): DatabaseSync {
  const { database } = paths();
  const db = new DatabaseSync(database);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;");
  return db;
}

function createSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS members (
      discord_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      position INTEGER NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS rotation (
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      member_id TEXT NOT NULL REFERENCES members(discord_id),
      pin INTEGER NOT NULL CHECK (pin IN (0, 1)),
      book_url TEXT,
      book_title TEXT,
      position INTEGER NOT NULL UNIQUE,
      PRIMARY KEY (year, month)
    );

    CREATE TABLE IF NOT EXISTS exclusions (
      member_id TEXT NOT NULL REFERENCES members(discord_id),
      month INTEGER NOT NULL,
      position INTEGER NOT NULL UNIQUE,
      PRIMARY KEY (member_id, month)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      notification_key TEXT PRIMARY KEY,
      intended_month TEXT NOT NULL,
      due_at TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'sending', 'sent')),
      attempt_count INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TEXT NOT NULL,
      lease_expires_at TEXT,
      claim_token TEXT,
      last_error TEXT,
      discord_message_id TEXT
    );

    CREATE TABLE IF NOT EXISTS notification_alerts (
      notification_key TEXT PRIMARY KEY REFERENCES notifications(notification_key),
      intended_month TEXT NOT NULL,
      error_message TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'sending', 'sent')),
      attempt_count INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TEXT NOT NULL,
      lease_expires_at TEXT,
      claim_token TEXT,
      last_error TEXT,
      discord_message_id TEXT
    );
  `);
}

function transaction<T>(db: DatabaseSync, work: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = work();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function writeScheduleRows(db: DatabaseSync, schedule: Schedule): void {
  db.exec(
    "DELETE FROM rotation; DELETE FROM exclusions; DELETE FROM members; DELETE FROM settings WHERE key = 'reminder_channel_id';"
  );

  const insertMember = db.prepare(
    "INSERT INTO members (discord_id, name, position) VALUES (?, ?, ?)"
  );
  schedule.members.forEach((member, position) => {
    insertMember.run(member.discordId, member.name, position);
  });

  const insertRotation = db.prepare(
    `INSERT INTO rotation
      (year, month, member_id, pin, book_url, book_title, position)
      VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  schedule.rotation.forEach((slot, position) => {
    insertRotation.run(
      slot.year,
      slot.month,
      slot.memberId,
      slot.pin ? 1 : 0,
      slot.bookUrl ?? null,
      slot.bookTitle ?? null,
      position
    );
  });

  const insertExclusion = db.prepare(
    "INSERT INTO exclusions (member_id, month, position) VALUES (?, ?, ?)"
  );
  schedule.exclusions.forEach((exclusion, position) => {
    insertExclusion.run(exclusion.memberId, exclusion.month, position);
  });
}

function importSchedule(db: DatabaseSync, schedulePath: string): void {
  const schedule = JSON.parse(readFileSync(schedulePath, "utf-8")) as Schedule;
  writeScheduleRows(db, schedule);
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(
    IMPORT_COMPLETE_KEY,
    "true"
  );
}

function activeMonthLabel(now = new Date()): string {
  const month = now.getMonth() + 1;
  if (month === 12) return `${now.getFullYear() + 1}-01`;
  return `${now.getFullYear()}-${String(month).padStart(2, "0")}`;
}

function hasScheduleData(db: DatabaseSync): boolean {
  return Boolean(
    db
      .prepare(
        `SELECT 1 FROM (
          SELECT 1 FROM members
          UNION ALL SELECT 1 FROM rotation
          UNION ALL SELECT 1 FROM exclusions
        ) LIMIT 1`
      )
      .get()
  );
}

export function initializeDataStore(): void {
  const { database, schedule } = paths();
  mkdirSync(dirname(database), { recursive: true });
  const db = openDatabase();
  let imported = false;

  try {
    transaction(db, () => {
      createSchema(db);
      const migrationComplete = db
        .prepare("SELECT 1 FROM settings WHERE key = ?")
        .get(IMPORT_COMPLETE_KEY);
      if (!migrationComplete) {
        if (hasScheduleData(db)) {
          db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(
            IMPORT_COMPLETE_KEY,
            "true"
          );
        } else if (existsSync(schedule)) {
          importSchedule(db, schedule);
          imported = true;
        }
      }
      db.prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO NOTHING`
      ).run(NOTIFICATION_TRACKING_BASELINE_MONTH_KEY, activeMonthLabel());
    });
  } finally {
    db.close();
  }

  if (imported) {
    console.log(`[dewey] Imported ${schedule} into SQLite`);
  }
}

export function withDataStore<T>(work: (db: DatabaseSync) => T): T {
  initializeDataStore();
  const db = openDatabase();

  try {
    return work(db);
  } finally {
    db.close();
  }
}

export function notificationTrackingBaselineMonth(): string {
  initializeDataStore();
  const db = openDatabase();

  try {
    const baseline = db
      .prepare("SELECT value FROM settings WHERE key = ?")
      .get(NOTIFICATION_TRACKING_BASELINE_MONTH_KEY) as
      | { value: string }
      | undefined;
    if (!baseline) {
      throw new Error("Notification tracking baseline was not initialized");
    }
    return baseline.value;
  } finally {
    db.close();
  }
}

export function withDataStoreTransaction<T>(work: (db: DatabaseSync) => T): T {
  return withDataStore((db) => transaction(db, () => work(db)));
}

export function readSchedule(): Schedule {
  initializeDataStore();
  const db = openDatabase();

  try {
    const members = db
      .prepare("SELECT discord_id, name FROM members ORDER BY position")
      .all() as unknown as MemberRow[];
    const rotation = db
      .prepare(
        "SELECT year, month, member_id, pin, book_url, book_title FROM rotation ORDER BY position"
      )
      .all() as unknown as RotationRow[];
    const exclusions = db
      .prepare("SELECT member_id, month FROM exclusions ORDER BY position")
      .all() as unknown as ExclusionRow[];

    return {
      members: members.map(
        (member): Member => ({ discordId: member.discord_id, name: member.name })
      ),
      rotation: rotation.map(
        (slot): RotationSlot => ({
          year: slot.year,
          month: slot.month,
          memberId: slot.member_id,
          pin: slot.pin === 1,
          ...(slot.book_url === null ? {} : { bookUrl: slot.book_url }),
          ...(slot.book_title === null ? {} : { bookTitle: slot.book_title }),
        })
      ),
      exclusions: exclusions.map(
        (exclusion): Exclusion => ({ memberId: exclusion.member_id, month: exclusion.month })
      ),
    };
  } finally {
    db.close();
  }
}

export function writeSchedule(schedule: Schedule): void {
  initializeDataStore();
  const db = openDatabase();

  try {
    transaction(db, () => writeScheduleRows(db, schedule));
  } finally {
    db.close();
  }
}
