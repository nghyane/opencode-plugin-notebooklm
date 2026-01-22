/**
 * Plugin Hooks v2
 * 
 * Tối ưu với normalized data, lightweight cache
 */

import { getClient } from "../client/api";
import * as cache from "../state/cache";
import * as session from "../state/session";
import {
  normalizeNotebooks,
  normalizeRawNotebook,
  normalizeStudioArtifact,
  type NormalizedNotebook,
} from "../state/normalizers";
import type { ToolResult, Notebook } from "../types";

// ============================================================================
// Types
// ============================================================================

interface BeforeCtx {
  tool: string;
  input: Record<string, unknown>;
}

interface AfterCtx {
  tool: string;
  input: Record<string, unknown>;
  output: ToolResult;
}

interface CompactCtx {
  output: { context?: string };
}

// ============================================================================
// tool.execute.before
// ============================================================================

export async function onToolExecuteBefore(
  ctx: BeforeCtx
): Promise<{ skip?: boolean; result?: ToolResult } | void> {
  const { tool, input } = ctx;

  // Track notebook context
  const nbId = input.notebook_id as string | undefined;
  if (nbId) {
    session.setActiveNotebook(nbId);
  }

  // Check cache (normalized data only)
  switch (tool) {
    case "notebook_list": {
      const cached = cache.get<NormalizedNotebook[]>(cache.key.notebooks());
      if (cached) {
        return {
          skip: true,
          result: { status: "success", notebooks: cached, _cached: true },
        };
      }
      break;
    }

    case "notebook_query": {
      const q = input.query as string;
      if (nbId && q) {
        const cached = cache.get<{ answer: string; conversationId: string }>(
          cache.key.query(nbId, q)
        );
        if (cached) {
          return {
            skip: true,
            result: {
              status: "success",
              answer: cached.answer,
              conversation_id: cached.conversationId,
              _cached: true,
            },
          };
        }
      }
      break;
    }
  }

  return undefined;
}

// ============================================================================
// tool.execute.after
// ============================================================================

export async function onToolExecuteAfter(ctx: AfterCtx): Promise<void> {
  const { tool, input, output } = ctx;

  if (output.status !== "success") return;

  switch (tool) {
    case "notebook_list": {
      // Cache normalized list
      const raw = output.notebooks as Notebook[];
      if (raw) {
        const normalized = normalizeNotebooks(raw);
        cache.set(cache.key.notebooks(), normalized, "notebooks");
        output.notebooks = normalized; // Replace with normalized
      }
      break;
    }

    case "notebook_get": {
      const nbId = input.notebook_id as string;
      const title = output.title as string;
      if (nbId && title) {
        session.setActiveNotebook(nbId, title);
      }
      break;
    }

    case "notebook_create":
    case "notebook_delete":
    case "notebook_rename": {
      cache.del("nbs"); // Invalidate list
      break;
    }

    case "notebook_query": {
      const nbId = input.notebook_id as string;
      const query = input.query as string;
      const answer = output.answer as string;
      const convId = output.conversation_id as string;

      if (nbId && query && answer) {
        // Cache query result
        cache.set(cache.key.query(nbId, query), { answer, conversationId: convId }, "query");
        // Track conversation
        session.setConversation(convId, query, answer);
      }
      break;
    }

    case "research_start": {
      const taskId = output.task_id as string;
      const nbId = output.notebook_id as string;
      const query = input.query as string;
      if (taskId && nbId) {
        session.addPendingTask("research", taskId, nbId, query);
      }
      break;
    }

    case "studio_create": {
      const artifactId = output.artifact_id as string;
      const nbId = input.notebook_id as string;
      const type = input.type as string;
      if (artifactId && nbId) {
        session.addPendingTask("studio", artifactId, nbId, type);
      }
      break;
    }
  }
}

// ============================================================================
// session.compacting
// ============================================================================

export async function onSessionCompacting(ctx: CompactCtx): Promise<void> {
  const summary = session.getContextSummary();
  if (summary) {
    ctx.output.context = `## NotebookLM State\n${summary}`;
  }
}

// ============================================================================
// session.idle - Background polling
// ============================================================================

export async function onSessionIdle(): Promise<void> {
  const tasks = session.getPendingTasks();
  if (tasks.length === 0) return;

  const client = getClient();

  for (const task of tasks) {
    try {
      if (task.type === "research") {
        const result = await client.pollResearch(task.notebookId, task.id);
        if (result.status === "completed") {
          await client.importResearchSources(task.notebookId, task.id);
          session.removePendingTask(task.id);
          console.log(`[notebooklm] Research "${task.label}" imported`);
        } else if (result.status === "failed") {
          session.removePendingTask(task.id);
        }
      } else if (task.type === "studio") {
        const artifacts = await client.pollStudioStatus(task.notebookId);
        const artifact = artifacts.find((a) => a.id === task.id);
        if (artifact?.status === "ready") {
          session.removePendingTask(task.id);
          console.log(`[notebooklm] ${task.label} ready: ${artifact.url}`);
        } else if (artifact?.status === "failed") {
          session.removePendingTask(task.id);
        }
      }
    } catch {
      // Silent fail for background task
    }
  }
}

// ============================================================================
// session.created - Preload
// ============================================================================

export async function onSessionCreated(): Promise<void> {
  try {
    const client = getClient();
    const notebooks = await client.listNotebooks();
    const normalized = normalizeNotebooks(notebooks);
    cache.set(cache.key.notebooks(), normalized, "notebooks");
  } catch {
    // Silent - preload is optional
  }
}

// ============================================================================
// Export
// ============================================================================

export const hooks = {
  "tool.execute.before": onToolExecuteBefore,
  "tool.execute.after": onToolExecuteAfter,
  "experimental.session.compacting": onSessionCompacting,
  "session.idle": onSessionIdle,
  "session.created": onSessionCreated,
};
