/**
 * Research Tools
 * 
 * Tools for deep/fast research - finding new sources via web or Drive search
 */

import { getClient } from "../client/api";
import type { ToolResult } from "../types";

/**
 * Start deep/fast research to find new sources
 */
export async function research_start(args: {
  query: string;
  source?: "web" | "drive";
  mode?: "fast" | "deep";
  notebook_id?: string;
  title?: string;
}): Promise<ToolResult> {
  try {
    const client = getClient();
    const result = await client.startResearch(
      args.query,
      args.source || "web",
      args.mode || "fast",
      args.notebook_id,
      args.title
    );

    return {
      status: "success",
      notebook_id: result.notebookId,
      task_id: result.taskId,
      message: args.mode === "deep"
        ? "Deep research started. This may take ~5 minutes. Poll research_status for progress."
        : "Fast research started. This should complete in ~30 seconds. Poll research_status for progress.",
    };
  } catch (e) {
    return { status: "error", error: String(e) };
  }
}

/**
 * Poll research progress
 */
export async function research_status(args: {
  notebook_id: string;
  task_id?: string;
  poll_interval?: number;
  max_wait?: number;
  compact?: boolean;
}): Promise<ToolResult> {
  try {
    const client = getClient();
    const pollInterval = (args.poll_interval ?? 30) * 1000;
    const maxWait = (args.max_wait ?? 300) * 1000;
    const compact = args.compact ?? true;

    const startTime = Date.now();

    while (true) {
      const result = await client.pollResearch(args.notebook_id, args.task_id);

      if (result.status === "completed" || result.status === "failed") {
        // Format response
        const sources = compact
          ? result.sources.slice(0, 10).map((s) => ({
              index: s.index,
              title: s.title.slice(0, 100),
              type: s.type,
            }))
          : result.sources;

        const report = compact && result.report
          ? result.report.slice(0, 2000) + (result.report.length > 2000 ? "..." : "")
          : result.report;

        return {
          status: "success",
          research_status: result.status,
          source_count: result.sources.length,
          sources,
          report,
          message: result.status === "completed"
            ? `Research completed. Found ${result.sources.length} sources. Use research_import to add them to notebook.`
            : "Research failed.",
        };
      }

      // Check timeout
      if (maxWait > 0 && Date.now() - startTime >= maxWait) {
        return {
          status: "success",
          research_status: result.status,
          source_count: result.sources.length,
          message: "Polling timeout. Research still in progress. Call again to continue polling.",
        };
      }

      // Single poll mode
      if (maxWait === 0) {
        return {
          status: "success",
          research_status: result.status,
          source_count: result.sources.length,
          message: `Research ${result.status}. Call again to check progress.`,
        };
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }
  } catch (e) {
    return { status: "error", error: String(e) };
  }
}

/**
 * Import discovered sources into notebook
 */
export async function research_import(args: {
  notebook_id: string;
  task_id: string;
  source_indices?: number[];
}): Promise<ToolResult> {
  try {
    const client = getClient();
    const count = await client.importResearchSources(
      args.notebook_id,
      args.task_id,
      args.source_indices
    );

    return {
      status: "success",
      imported_count: count,
      message: args.source_indices
        ? `Imported ${count} selected sources.`
        : `Imported all ${count} discovered sources.`,
    };
  } catch (e) {
    return { status: "error", error: String(e) };
  }
}

// Export tool metadata for OpenCode
export const researchToolsMetadata = {
  research_start: {
    description: "Deep research / fast research: Search web or Google Drive to FIND NEW sources. Use for: \"deep research on X\", \"find sources about Y\". Workflow: research_start -> poll research_status -> research_import.",
    args: {
      query: { type: "string", required: true, description: "What to search for" },
      source: { type: "string", optional: true, description: "web|drive (default: web)" },
      mode: { type: "string", optional: true, description: "fast (~30s) | deep (~5min, web only)" },
      notebook_id: { type: "string", optional: true, description: "Existing notebook (creates new if not provided)" },
      title: { type: "string", optional: true, description: "Title for new notebook" },
    },
  },
  research_status: {
    description: "Poll research progress. Blocks until complete or timeout.",
    args: {
      notebook_id: { type: "string", required: true, description: "Notebook UUID" },
      task_id: { type: "string", optional: true, description: "Task ID to poll for specific research task" },
      poll_interval: { type: "number", optional: true, description: "Seconds between polls (default: 30)" },
      max_wait: { type: "number", optional: true, description: "Max seconds to wait (default: 300, 0=single poll)" },
      compact: { type: "boolean", optional: true, description: "Truncate report and limit sources (default: true)" },
    },
  },
  research_import: {
    description: "Import discovered sources into notebook. Call after research_status shows status=completed.",
    args: {
      notebook_id: { type: "string", required: true, description: "Notebook UUID" },
      task_id: { type: "string", required: true, description: "Research task ID" },
      source_indices: { type: "array", optional: true, description: "Source indices to import (default: all)" },
    },
  },
};
