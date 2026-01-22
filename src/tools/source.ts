/**
 * Source Tools v2
 * 
 * Merged source_describe + source_get_content → source_get
 * source_list_drive + source_sync_drive → handled by hooks (background)
 */

import { getClient } from "../client/api";
import type { ToolResult } from "../types";

// ============================================================================
// source_get (merged describe + get_content)
// ============================================================================

export async function source_get(args: {
  source_id: string;
  include_content?: boolean;
  include_summary?: boolean;
}): Promise<ToolResult> {
  try {
    const client = getClient();
    const result: ToolResult = { status: "success" };

    // Always get basic content/metadata
    const content = await client.getSourceContent(args.source_id);
    result.title = content.title;
    result.source_type = content.sourceType;
    result.url = content.url;
    result.char_count = content.charCount;

    // Optionally include full content
    if (args.include_content) {
      // Truncate very long content for token optimization
      const maxChars = 50000;
      result.content = content.content.length > maxChars
        ? content.content.slice(0, maxChars) + `\n\n[Truncated: ${content.content.length - maxChars} more chars]`
        : content.content;
    }

    // Optionally include AI summary
    if (args.include_summary) {
      try {
        const guide = await client.getSourceGuide(args.source_id);
        result.summary = guide.summary;
        result.keywords = guide.keywords;
      } catch {
        // Summary failed, continue without it
      }
    }

    return result;
  } catch (e) {
    return { status: "error", error: String(e) };
  }
}

// ============================================================================
// source_delete
// ============================================================================

export async function source_delete(args: {
  source_id: string;
  confirm?: boolean;
}): Promise<ToolResult> {
  if (!args.confirm) {
    return {
      status: "error",
      error: "Deletion not confirmed. Set confirm=true after user approval.",
      warning: "IRREVERSIBLE action.",
    };
  }

  try {
    const client = getClient();
    await client.deleteSource(args.source_id);
    return { status: "success", message: "Source deleted." };
  } catch (e) {
    return { status: "error", error: String(e) };
  }
}

// ============================================================================
// Note: source_list_drive and source_sync_drive are now handled by hooks
// - session.idle hook auto-checks Drive freshness
// - Stale sources are auto-synced in background
// ============================================================================
