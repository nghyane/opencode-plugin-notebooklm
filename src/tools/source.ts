/**
 * Source Tools
 * 
 * Tools for managing NotebookLM sources
 */

import { getClient } from "../client/api";
import type { ToolResult } from "../types";

/**
 * Get AI-generated source summary with keyword chips
 */
export async function source_describe(args: {
  source_id: string;
}): Promise<ToolResult> {
  try {
    const client = getClient();
    const result = await client.getSourceGuide(args.source_id);

    return {
      status: "success",
      summary: result.summary,
      keywords: result.keywords,
    };
  } catch (e) {
    return { status: "error", error: String(e) };
  }
}

/**
 * Get raw text content of a source (no AI processing)
 */
export async function source_get_content(args: {
  source_id: string;
}): Promise<ToolResult> {
  try {
    const client = getClient();
    const result = await client.getSourceContent(args.source_id);

    return {
      status: "success",
      content: result.content,
      title: result.title,
      source_type: result.sourceType,
      url: result.url,
      char_count: result.charCount,
    };
  } catch (e) {
    return { status: "error", error: String(e) };
  }
}

/**
 * List sources with types and Drive freshness status
 */
export async function source_list_drive(args: {
  notebook_id: string;
}): Promise<ToolResult> {
  try {
    const client = getClient();
    const notebook = await client.getNotebook(args.notebook_id) as unknown[];

    if (!notebook || !Array.isArray(notebook)) {
      return { status: "error", error: "Failed to get notebook" };
    }

    const sources: Array<{
      id: string;
      title: string;
      type: string;
      is_drive: boolean;
      is_fresh?: boolean;
    }> = [];

    // Extract sources from notebook data
    const sourcesData = notebook[1] || [];
    if (Array.isArray(sourcesData)) {
      for (const src of sourcesData) {
        if (Array.isArray(src) && src.length >= 2) {
          const srcIds = src[0] || [];
          const srcTitle = src[1] || "Untitled";
          const srcId = Array.isArray(srcIds) ? srcIds[0] : srcIds;
          const metadata = src[2] || [];
          const srcType = metadata[4] || 0;

          // Check if it's a Drive source (type 1 or 2)
          const isDrive = srcType === 1 || srcType === 2;

          sources.push({
            id: srcId,
            title: srcTitle,
            type: getSourceTypeName(srcType),
            is_drive: isDrive,
          });
        }
      }
    }

    // Check freshness for Drive sources
    for (const src of sources) {
      if (src.is_drive) {
        try {
          const isFresh = await client.checkSourceFreshness(src.id);
          src.is_fresh = isFresh ?? undefined;
        } catch {
          // Skip freshness check on error
        }
      }
    }

    return {
      status: "success",
      count: sources.length,
      sources,
    };
  } catch (e) {
    return { status: "error", error: String(e) };
  }
}

/**
 * Sync Drive sources with latest content
 */
export async function source_sync_drive(args: {
  source_ids: string[];
  confirm?: boolean;
}): Promise<ToolResult> {
  if (!args.confirm) {
    return {
      status: "error",
      error: "Sync not confirmed. Set confirm=true after user approval.",
    };
  }

  try {
    const client = getClient();
    const results: Array<{ id: string; title: string; synced_at: number | null }> = [];

    for (const sourceId of args.source_ids) {
      const result = await client.syncDriveSource(sourceId);
      if (result) {
        results.push({
          id: result.id,
          title: result.title,
          synced_at: result.syncedAt,
        });
      }
    }

    return {
      status: "success",
      synced_count: results.length,
      sources: results,
    };
  } catch (e) {
    return { status: "error", error: String(e) };
  }
}

/**
 * Delete source permanently
 */
export async function source_delete(args: {
  source_id: string;
  confirm?: boolean;
}): Promise<ToolResult> {
  if (!args.confirm) {
    return {
      status: "error",
      error: "Deletion not confirmed. Set confirm=true after user approval.",
      warning: "This action is IRREVERSIBLE.",
    };
  }

  try {
    const client = getClient();
    const result = await client.deleteSource(args.source_id);

    if (result) {
      return {
        status: "success",
        message: `Source ${args.source_id} has been permanently deleted.`,
      };
    }
    return { status: "error", error: "Failed to delete source" };
  } catch (e) {
    return { status: "error", error: String(e) };
  }
}

// Helper
function getSourceTypeName(code: number): string {
  const types: Record<number, string> = {
    1: "google_docs",
    2: "google_other",
    4: "pasted_text",
    5: "web",
  };
  return types[code] || "unknown";
}

// Export tool metadata for OpenCode
export const sourceToolsMetadata = {
  source_describe: {
    description: "Get AI-generated source summary with keyword chips",
    args: {
      source_id: { type: "string", required: true, description: "Source UUID" },
    },
  },
  source_get_content: {
    description: "Get raw text content of a source (no AI processing). Much faster than notebook_query for content export.",
    args: {
      source_id: { type: "string", required: true, description: "Source UUID" },
    },
  },
  source_list_drive: {
    description: "List sources with types and Drive freshness status. Use before source_sync_drive.",
    args: {
      notebook_id: { type: "string", required: true, description: "Notebook UUID" },
    },
  },
  source_sync_drive: {
    description: "Sync Drive sources with latest content. Requires confirm=true. Call source_list_drive first.",
    args: {
      source_ids: { type: "array", required: true, description: "Source UUIDs to sync" },
      confirm: { type: "boolean", optional: true, description: "Must be true after user approval" },
    },
  },
  source_delete: {
    description: "Delete source permanently. IRREVERSIBLE. Requires confirm=true",
    args: {
      source_id: { type: "string", required: true, description: "Source UUID to delete" },
      confirm: { type: "boolean", optional: true, description: "Must be true after user approval" },
    },
  },
};
