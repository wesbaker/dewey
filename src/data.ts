import { readFileSync, writeFileSync, existsSync, copyFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Schedule } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = resolve(__dirname, "../data/schedule.json");
const EXAMPLE_PATH = resolve(__dirname, "../data/schedule.example.json");

export function readSchedule(): Schedule {
  if (!existsSync(DATA_PATH)) {
    copyFileSync(EXAMPLE_PATH, DATA_PATH);
  }
  const raw = readFileSync(DATA_PATH, "utf-8");
  return JSON.parse(raw) as Schedule;
}

export function writeSchedule(schedule: Schedule): void {
  writeFileSync(DATA_PATH, JSON.stringify(schedule, null, 2) + "\n", "utf-8");
}
