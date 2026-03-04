import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ─── LOCAL WARNING STORE ──────────────────────────────────────────────────────
// Stores member warnings in a local JSON file.
// Uses in-memory cache + async flush to avoid sync I/O blocking and race conditions.

const DB_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../warnings.json"
);

export type Warning = {
  id: string;
  userId: string;
  username: string;
  reason: string;
  moderator: string;
  timestamp: string;
};

type WarningDB = Record<string, Warning[]>;

// In-memory cache — loaded once, flushed async on writes
let _cache: WarningDB | null = null;

function getDB(): WarningDB {
  if (_cache !== null) return _cache;
  try {
    _cache = JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
  } catch {
    _cache = {};
  }
  return _cache!;
}

async function flushDB(): Promise<void> {
  await fs.promises.writeFile(DB_PATH, JSON.stringify(_cache, null, 2));
}

export async function addWarning(
  userId: string, username: string, reason: string, moderator: string
): Promise<Warning> {
  const db = getDB();
  if (!db[userId]) db[userId] = [];
  const warning: Warning = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    userId, username, reason, moderator,
    timestamp: new Date().toISOString(),
  };
  db[userId].push(warning);
  await flushDB();
  return warning;
}

export function getWarnings(userId: string): Warning[] {
  return getDB()[userId] ?? [];
}

export async function clearWarnings(userId: string): Promise<number> {
  const db = getDB();
  const count = db[userId]?.length ?? 0;
  delete db[userId];
  await flushDB();
  return count;
}
