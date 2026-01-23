/**
 * Conversation persistence using Bun native APIs
 */

import { homedir } from "node:os";
import { join } from "node:path";
import type { ConversationTurn } from "../types";

const CACHE_DIR = join(homedir(), ".notebooklm-mcp");
const CACHE_PATH = join(CACHE_DIR, "conversations.json");

/**
 * Load conversations from disk (sync for initialization)
 */
export function loadConversations(): Map<string, ConversationTurn[]> {
  const map = new Map<string, ConversationTurn[]>();
  const file = Bun.file(CACHE_PATH);

  // Use sync check - Bun.file() is lazy, we need to check existence
  try {
    // Bun's synchronous file read pattern
    const text = require("fs").readFileSync(CACHE_PATH, "utf-8");
    const data = JSON.parse(text) as Record<string, ConversationTurn[]>;

    for (const [id, turns] of Object.entries(data)) {
      if (Array.isArray(turns)) {
        map.set(id, turns);
      }
    }
  } catch {
    // File doesn't exist or invalid - return empty map
  }

  return map;
}

/**
 * Save conversations to disk (async for performance)
 */
export function saveConversations(map: Map<string, ConversationTurn[]>): void {
  // Ensure directory exists
  const fs = require("fs");
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }

  // Convert Map to Record for JSON serialization
  const data: Record<string, ConversationTurn[]> = Object.fromEntries(map);

  // Use Bun.write for async file writing (fire and forget)
  Bun.write(CACHE_PATH, JSON.stringify(data, null, 2)).catch(() => {
    // Silently fail - persistence is not critical
  });
}

/**
 * Async version for when we can await
 */
export async function loadConversationsAsync(): Promise<Map<string, ConversationTurn[]>> {
  const map = new Map<string, ConversationTurn[]>();
  const file = Bun.file(CACHE_PATH);

  if (!(await file.exists())) {
    return map;
  }

  try {
    const text = await file.text();
    const data = JSON.parse(text) as Record<string, ConversationTurn[]>;

    for (const [id, turns] of Object.entries(data)) {
      if (Array.isArray(turns)) {
        map.set(id, turns);
      }
    }
  } catch {
    // Invalid JSON - return empty map
  }

  return map;
}

/**
 * Async save
 */
export async function saveConversationsAsync(map: Map<string, ConversationTurn[]>): Promise<void> {
  // Ensure directory exists using Bun shell
  const fs = require("fs");
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }

  const data: Record<string, ConversationTurn[]> = Object.fromEntries(map);
  await Bun.write(CACHE_PATH, JSON.stringify(data, null, 2));
}
