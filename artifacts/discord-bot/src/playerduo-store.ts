import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(here, "../data");
const STORE_FILE = path.join(DATA_DIR, "playerduo.json");

export interface PlayerduoEntry {
  code: string;
  userId: string;
  details: string;
  imageUrl: string | null;
  channelId: string;
  messageId: string;
  createdBy: string;
  createdAt: string;
}

let cache: PlayerduoEntry[] | null = null;

async function ensureLoaded(): Promise<PlayerduoEntry[]> {
  if (cache) return cache;
  try {
    const text = await fs.readFile(STORE_FILE, "utf8");
    const parsed = JSON.parse(text);
    cache = Array.isArray(parsed) ? (parsed as PlayerduoEntry[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

async function persist(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(
    STORE_FILE,
    JSON.stringify(cache ?? [], null, 2),
    "utf8",
  );
}

export async function getAllEntries(): Promise<PlayerduoEntry[]> {
  const list = await ensureLoaded();
  return [...list].sort((a, b) => a.code.localeCompare(b.code));
}

export async function addEntry(entry: PlayerduoEntry): Promise<void> {
  const list = await ensureLoaded();
  const idx = list.findIndex((e) => e.code === entry.code);
  if (idx >= 0) list[idx] = entry;
  else list.push(entry);
  await persist();
}

export async function getEntry(
  code: string,
): Promise<PlayerduoEntry | null> {
  const list = await ensureLoaded();
  return list.find((e) => e.code === code) ?? null;
}

export async function deleteEntry(code: string): Promise<boolean> {
  const list = await ensureLoaded();
  const idx = list.findIndex((e) => e.code === code);
  if (idx < 0) return false;
  list.splice(idx, 1);
  await persist();
  return true;
}
