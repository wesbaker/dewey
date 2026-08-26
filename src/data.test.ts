import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Schedule } from "./types.js";

const originalDataDirectory = process.env.DEWEY_DATA_DIR;
const temporaryDirectories: string[] = [];

const schedule: Schedule = {
  members: [
    { discordId: "111", name: "Alice" },
    { discordId: "222", name: "Bob" },
  ],
  rotation: [
    {
      year: 2026,
      month: 8,
      memberId: "111",
      pin: true,
      bookUrl: "https://goodreads.com/book/1",
      bookTitle: "A Book",
    },
  ],
  exclusions: [{ memberId: "222", month: 8 }],
};

type DataStoreModule = typeof import("./data.js") & {
  initializeDataStore(): void;
};

function createDataDirectory(): string {
  const dataDirectory = mkdtempSync(join(tmpdir(), "dewey-data-"));
  temporaryDirectories.push(dataDirectory);
  writeFileSync(join(dataDirectory, "schedule.json"), JSON.stringify(schedule, null, 2) + "\n");
  return dataDirectory;
}

function createEmptyDataDirectory(): string {
  const dataDirectory = mkdtempSync(join(tmpdir(), "dewey-empty-data-"));
  temporaryDirectories.push(dataDirectory);
  return dataDirectory;
}

async function loadDataStore(dataDirectory: string): Promise<DataStoreModule> {
  process.env.DEWEY_DATA_DIR = dataDirectory;
  vi.resetModules();
  return import("./data.js") as Promise<DataStoreModule>;
}

afterEach(() => {
  if (originalDataDirectory === undefined) {
    delete process.env.DEWEY_DATA_DIR;
  } else {
    process.env.DEWEY_DATA_DIR = originalDataDirectory;
  }

  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("SQLite schedule store", () => {
  it("initializes an empty schedule without creating a JSON example", async () => {
    const dataDirectory = createEmptyDataDirectory();
    const data = await loadDataStore(dataDirectory);

    data.initializeDataStore();

    expect(data.readSchedule()).toEqual({ members: [], rotation: [], exclusions: [] });
    expect(existsSync(join(dataDirectory, "schedule.json"))).toBe(false);
  });

  it("imports JSON into a database without changing the backup", async () => {
    const dataDirectory = createDataDirectory();
    const jsonPath = join(dataDirectory, "schedule.json");
    const originalJson = readFileSync(jsonPath);
    const data = await loadDataStore(dataDirectory);

    data.initializeDataStore();

    expect(existsSync(join(dataDirectory, "dewey.sqlite"))).toBe(true);
    expect(readFileSync(jsonPath)).toEqual(originalJson);
    expect(data.readSchedule()).toEqual(schedule);
  });

  it("persists a changed schedule for a newly loaded store", async () => {
    const dataDirectory = createDataDirectory();
    const firstStore = await loadDataStore(dataDirectory);
    const changedSchedule: Schedule = {
      ...schedule,
      members: [...schedule.members, { discordId: "333", name: "Casey" }],
    };

    firstStore.initializeDataStore();
    firstStore.writeSchedule(changedSchedule);

    const secondStore = await loadDataStore(dataDirectory);
    secondStore.initializeDataStore();

    expect(secondStore.readSchedule()).toEqual(changedSchedule);
  });

  it("retries JSON migration when an interrupted first start left an empty database", async () => {
    const dataDirectory = createDataDirectory();
    const interruptedDatabase = new DatabaseSync(join(dataDirectory, "dewey.sqlite"));
    interruptedDatabase.close();
    const data = await loadDataStore(dataDirectory);

    data.initializeDataStore();

    expect(data.readSchedule()).toEqual(schedule);
  });

  it("keeps populated legacy SQLite data when its migration marker is missing", async () => {
    const dataDirectory = createDataDirectory();
    const legacySchedule: Schedule = {
      ...schedule,
      members: [{ discordId: "999", name: "Legacy Member" }],
      rotation: [],
      exclusions: [],
    };
    const firstStore = await loadDataStore(dataDirectory);
    firstStore.initializeDataStore();
    firstStore.writeSchedule(legacySchedule);

    const legacyDatabase = new DatabaseSync(join(dataDirectory, "dewey.sqlite"));
    legacyDatabase
      .prepare("DELETE FROM settings WHERE key = ?")
      .run("schedule_import_complete");
    legacyDatabase.close();

    const secondStore = await loadDataStore(dataDirectory);
    secondStore.initializeDataStore();

    expect(secondStore.readSchedule()).toEqual(legacySchedule);

    const migratedDatabase = new DatabaseSync(join(dataDirectory, "dewey.sqlite"));
    expect(
      migratedDatabase
        .prepare("SELECT value FROM settings WHERE key = ?")
        .get("schedule_import_complete")
    ).toEqual({ value: "true" });
    migratedDatabase.close();
  });

  it("does not persist a reminder channel setting during JSON migration", async () => {
    const dataDirectory = createDataDirectory();
    const data = await loadDataStore(dataDirectory);

    data.initializeDataStore();

    const database = new DatabaseSync(join(dataDirectory, "dewey.sqlite"));
    expect(
      database.prepare("SELECT 1 FROM settings WHERE key = ?").get("reminder_channel_id")
    ).toBeUndefined();
    database.close();
  });
});
