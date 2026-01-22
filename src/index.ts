/**
 * OpenCode Plugin: NotebookLM v2
 * 
 * Architecture:
 * - 16 tools (down from 32)
 * - 5 hooks (auto caching, polling, context preservation)
 * - Normalized data structures
 * - Lightweight state management
 */

import type { ToolResult } from "./types";
import { hooks } from "./hooks";

// Import optimized tools
import * as notebook from "./tools/notebook";
import * as source from "./tools/source";
import * as research from "./tools/research";
import * as studio from "./tools/studio";
import * as auth from "./tools/auth";

// ============================================================================
// Plugin Context Types
// ============================================================================

interface PluginContext {
  project: { name: string; root: string };
  directory: string;
  worktree: string;
}

// ============================================================================
// Tool Registry (16 tools)
// ============================================================================

const tools = {
  // Notebook (10)
  notebook_list: notebook.notebook_list,
  notebook_create: notebook.notebook_create,
  notebook_get: notebook.notebook_get,           // merged with describe
  notebook_query: notebook.notebook_query,
  notebook_delete: notebook.notebook_delete,
  notebook_rename: notebook.notebook_rename,
  notebook_add_url: notebook.notebook_add_url,
  notebook_add_text: notebook.notebook_add_text,
  notebook_add_drive: notebook.notebook_add_drive,
  chat_configure: notebook.chat_configure,

  // Source (2) - list_drive, sync_drive → hooks
  source_get: source.source_get,                 // merged describe + get_content
  source_delete: source.source_delete,

  // Research (1) - status, import → hooks
  research_start: research.research_start,

  // Studio (2) - 9 create tools → 1 unified
  studio_create: studio.studio_create,           // unified all types
  studio_delete: studio.studio_delete,

  // Auth (1)
  save_auth_tokens: auth.save_auth_tokens,
} as const;

type ToolRegistry = typeof tools;

// ============================================================================
// Plugin Export
// ============================================================================

interface Plugin<T> {
  name: string;
  description: string;
  version: string;
  tools: T;
  hooks: typeof hooks;
}

export default async function plugin(_ctx: PluginContext): Promise<Plugin<ToolRegistry>> {
  return {
    name: "notebooklm",
    description: "NotebookLM - notebooks, sources, research, studio generation",
    version: "2.0.0",
    tools,
    hooks,
  };
}

// ============================================================================
// Re-exports
// ============================================================================

export * from "./types";
export { getClient, resetClient } from "./client/api";
export { hooks } from "./hooks";
export type { ToolRegistry };
