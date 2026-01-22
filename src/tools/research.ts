/**
 * Research Tools v2
 * 
 * Only research_start is a tool
 * research_status + research_import are handled by hooks (auto-poll + auto-import)
 */

import { getClient } from "../client/api";
import type { ToolResult } from "../types";

// ============================================================================
// research_start
// ============================================================================

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

    const isDeep = args.mode === "deep";

    return {
      status: "success",
      notebook_id: result.notebookId,
      task_id: result.taskId,
      mode: args.mode || "fast",
      message: isDeep
        ? "Deep research started (~5 min). Results will be auto-imported when ready."
        : "Fast research started (~30 sec). Results will be auto-imported when ready.",
      _note: "No need to poll - plugin auto-monitors and imports results.",
    };
  } catch (e) {
    return { status: "error", error: String(e) };
  }
}

// ============================================================================
// Note: research_status and research_import are now hooks
// - session.idle hook auto-polls pending research tasks
// - Completed research is auto-imported
// - User is notified via console.log when complete
// ============================================================================
