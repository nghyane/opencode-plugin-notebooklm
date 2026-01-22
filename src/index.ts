/**
 * OpenCode Plugin Entry Point
 * 
 * NotebookLM Plugin for OpenCode
 * Provides 32 tools for interacting with Google NotebookLM
 */

import type { ToolResult } from "./types";

// Import all tools
import * as notebookTools from "./tools/notebook";
import * as sourceTools from "./tools/source";
import * as researchTools from "./tools/research";
import * as studioTools from "./tools/studio";
import * as authTools from "./tools/auth";

// Import client utilities
import { loadCachedTokens } from "./auth/tokens";

// ============================================================================
// Type-Safe Plugin Definition (Generic Registry Pattern)
// ============================================================================

interface PluginContext {
  project: {
    name: string;
    root: string;
  };
  directory: string;
  worktree: string;
}

interface PluginHooks {
  "session.start"?: () => Promise<void>;
  "session.end"?: () => Promise<void>;
}

/**
 * Generic tool function type - preserves specific arg types
 */
type ToolFn<TArgs, TResult = ToolResult> = (args: TArgs) => Promise<TResult>;

/**
 * Plugin interface - generic over its tool registry (no constraint on index signature)
 */
interface Plugin<TTools> {
  name: string;
  description: string;
  version: string;
  tools: TTools;
  hooks?: PluginHooks;
}

/**
 * Helper to define plugin with full type inference
 */
function definePlugin<TTools>(
  config: Plugin<TTools>
): Plugin<TTools> {
  return config;
}

// ============================================================================
// Tool Registry - All tools with their specific arg types preserved
// ============================================================================

const toolRegistry = {
  // Notebook tools (11)
  notebook_list: notebookTools.notebook_list,
  notebook_create: notebookTools.notebook_create,
  notebook_get: notebookTools.notebook_get,
  notebook_describe: notebookTools.notebook_describe,
  notebook_query: notebookTools.notebook_query,
  notebook_delete: notebookTools.notebook_delete,
  notebook_rename: notebookTools.notebook_rename,
  notebook_add_url: notebookTools.notebook_add_url,
  notebook_add_text: notebookTools.notebook_add_text,
  notebook_add_drive: notebookTools.notebook_add_drive,
  chat_configure: notebookTools.chat_configure,

  // Source tools (5)
  source_describe: sourceTools.source_describe,
  source_get_content: sourceTools.source_get_content,
  source_list_drive: sourceTools.source_list_drive,
  source_sync_drive: sourceTools.source_sync_drive,
  source_delete: sourceTools.source_delete,

  // Research tools (3)
  research_start: researchTools.research_start,
  research_status: researchTools.research_status,
  research_import: researchTools.research_import,

  // Studio tools (11)
  audio_overview_create: studioTools.audio_overview_create,
  video_overview_create: studioTools.video_overview_create,
  infographic_create: studioTools.infographic_create,
  slide_deck_create: studioTools.slide_deck_create,
  report_create: studioTools.report_create,
  flashcards_create: studioTools.flashcards_create,
  quiz_create: studioTools.quiz_create,
  data_table_create: studioTools.data_table_create,
  mind_map_create: studioTools.mind_map_create,
  studio_status: studioTools.studio_status,
  studio_delete: studioTools.studio_delete,

  // Auth tools (2)
  refresh_auth: authTools.refresh_auth,
  save_auth_tokens: authTools.save_auth_tokens,
} as const;

// Infer the exact registry type
type NotebookLMTools = typeof toolRegistry;

/**
 * Check if authentication is available
 */
async function ensureAuthenticated(): Promise<void> {
  const cached = loadCachedTokens();
  if (!cached) {
    console.warn(
      "[notebooklm] No authentication found. Run 'notebooklm-mcp-auth' to authenticate."
    );
  }
}

/**
 * OpenCode Plugin Export
 */
export default async function plugin(_ctx: PluginContext): Promise<Plugin<NotebookLMTools>> {
  return definePlugin({
    name: "notebooklm",
    description: "Access Google NotebookLM - create notebooks, add sources, query AI, generate audio/video/reports",
    version: "1.0.0",
    tools: toolRegistry,
    hooks: {
      "session.start": async () => {
        await ensureAuthenticated();
      },
    },
  });
}

// ============================================================================
// Direct Exports for Custom Tools
// ============================================================================

// Re-export all tools for use in .opencode/tools/
export * from "./tools/notebook";
export * from "./tools/source";
export * from "./tools/research";
export * from "./tools/studio";
export * from "./tools/auth";

// Re-export types
export * from "./types";

// Re-export client
export { getClient, resetClient } from "./client/api";
export { loadCachedTokens, saveTokensToCache } from "./auth/tokens";

// Export tool registry type for consumers
export type { NotebookLMTools };
