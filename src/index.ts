/**
 * OpenCode Plugin: NotebookLM v2
 * 
 * Bare-metal implementation (no SDK dependency) to avoid version mismatches.
 * Uses function validators for args to satisfy OpenCode loader.
 */

import { hooks } from "./hooks";
import { getClient, resetClient } from "./client/api";
import { saveTokensToCache, parseCookieHeader, validateCookies, type AuthTokens } from "./auth/tokens";

export * from "./types";
export { getClient, resetClient } from "./client/api";
export { hooks } from "./hooks";

// ============================================================================
// Helpers
// ============================================================================

const json = (obj: unknown): string => JSON.stringify(obj, null, 2);

// Simple validators that won't crash the loader
// The loader likely expects: (value) => boolean | string
const v = {
  string: () => (val: unknown) => typeof val === 'string' ? true : "Expected string",
  number: () => (val: unknown) => typeof val === 'number' ? true : "Expected number",
  boolean: () => (val: unknown) => typeof val === 'boolean' ? true : "Expected boolean",
  optional: (validator: Function) => (val: unknown) => val === undefined || val === null || validator(val),
};

// ============================================================================
// Tool Definitions (Raw Objects)
// ============================================================================

const notebook_list = {
  description: "List all notebooks",
  args: {
    max_results: v.optional(v.number()),
  },
  async execute(args: any) {
    try {
      const client = getClient();
      const notebooks = await client.listNotebooks();
      const max = args.max_results ?? 20;

      return json({
        count: notebooks.length,
        notebooks: notebooks.slice(0, max).map((nb) => ({
          id: nb.id,
          title: nb.title,
          source_count: nb.sourceCount,
          url: `https://notebooklm.google.com/notebook/${nb.id}`,
          owned: nb.isOwned,
        })),
      });
    } catch (e: any) {
      return json({ status: "error", error: String(e) });
    }
  },
};

const notebook_create = {
  description: "Create a new notebook",
  args: {
    title: v.optional(v.string()),
  },
  async execute(args: any) {
    try {
      const client = getClient();
      const nb = await client.createNotebook(args.title || "");
      if (!nb) throw new Error("Failed to create");
      return json({
        id: nb.id,
        title: nb.title,
        url: `https://notebooklm.google.com/notebook/${nb.id}`,
      });
    } catch (e: any) {
      return json({ status: "error", error: String(e) });
    }
  },
};

const notebook_get = {
  description: "Get notebook details",
  args: {
    notebook_id: v.string(),
    include_summary: v.optional(v.boolean()),
  },
  async execute(args: any) {
    try {
      const client = getClient();
      const raw = await client.getNotebook(args.notebook_id);
      
      if (!raw || !Array.isArray(raw)) throw new Error("Notebook not found");

      const title = raw[0] || "Untitled";
      const sourcesData = Array.isArray(raw[1]) ? raw[1] : [];
      const sources = sourcesData.map((src: unknown[]) => ({
        id: Array.isArray(src[0]) ? src[0][0] : src[0],
        title: src[1] || "Untitled",
      }));

      const result: Record<string, unknown> = {
        id: args.notebook_id,
        title,
        source_count: sources.length,
        sources: sources.slice(0, 20),
        url: `https://notebooklm.google.com/notebook/${args.notebook_id}`,
      };

      if (args.include_summary) {
        try {
          const summary = await client.getNotebookSummary(args.notebook_id);
          result.summary = summary.summary;
          result.suggested_topics = summary.suggestedTopics.slice(0, 5);
        } catch {}
      }

      return json(result);
    } catch (e: any) {
      return json({ status: "error", error: String(e) });
    }
  },
};

const notebook_query = {
  description: "Ask AI about sources in notebook",
  args: {
    notebook_id: v.string(),
    query: v.string(),
    source_ids: v.optional(v.string()),
    conversation_id: v.optional(v.string()),
  },
  async execute(args: any) {
    try {
      const sourceIds = args.source_ids?.split(",").map((s: string) => s.trim());
      const client = getClient();
      const result = await client.query(
        args.notebook_id,
        args.query,
        sourceIds,
        args.conversation_id
      );
      return json({
        answer: result.answer,
        conversation_id: result.conversationId,
      });
    } catch (e: any) {
      return json({ status: "error", error: String(e) });
    }
  },
};

const notebook_delete = {
  description: "Delete notebook permanently. IRREVERSIBLE.",
  args: {
    notebook_id: v.string(),
    confirm: v.boolean(),
  },
  async execute(args: any) {
    if (!args.confirm) return json({ status: "error", error: "Set confirm=true" });
    try {
      const client = getClient();
      await client.deleteNotebook(args.notebook_id);
      return json({ message: "Deleted" });
    } catch (e: any) {
      return json({ status: "error", error: String(e) });
    }
  },
};

const notebook_rename = {
  description: "Rename a notebook",
  args: {
    notebook_id: v.string(),
    new_title: v.string(),
  },
  async execute(args: any) {
    try {
      const client = getClient();
      await client.renameNotebook(args.notebook_id, args.new_title);
      return json({ title: args.new_title });
    } catch (e: any) {
      return json({ status: "error", error: String(e) });
    }
  },
};

const notebook_add_url = {
  description: "Add URL source",
  args: {
    notebook_id: v.string(),
    url: v.string(),
  },
  async execute(args: any) {
    try {
      const client = getClient();
      const source = await client.addUrlSource(args.notebook_id, args.url);
      if (!source) throw new Error("Failed");
      return json({ source });
    } catch (e: any) {
      return json({ status: "error", error: String(e) });
    }
  },
};

const notebook_add_text = {
  description: "Add text source",
  args: {
    notebook_id: v.string(),
    text: v.string(),
    title: v.optional(v.string()),
  },
  async execute(args: any) {
    try {
      const client = getClient();
      const source = await client.addTextSource(args.notebook_id, args.text, args.title || "Pasted Text");
      if (!source) throw new Error("Failed");
      return json({ source });
    } catch (e: any) {
      return json({ status: "error", error: String(e) });
    }
  },
};

const notebook_add_drive = {
  description: "Add Drive source",
  args: {
    notebook_id: v.string(),
    document_id: v.string(),
    title: v.string(),
    doc_type: v.optional(v.string()),
  },
  async execute(args: any) {
    try {
      const mimeTypes: Record<string, string> = {
        doc: "application/vnd.google-apps.document",
        slides: "application/vnd.google-apps.presentation",
        sheets: "application/vnd.google-apps.spreadsheet",
        pdf: "application/pdf",
      };
      const mimeType = mimeTypes[args.doc_type || "doc"];
      if (!mimeType) return json({ status: "error", error: "Invalid doc_type" });

      const client = getClient();
      const source = await client.addDriveSource(args.notebook_id, args.document_id, args.title, mimeType);
      if (!source) throw new Error("Failed");
      return json({ source });
    } catch (e: any) {
      return json({ status: "error", error: String(e) });
    }
  },
};

const source_get = {
  description: "Get source content/metadata",
  args: {
    source_id: v.string(),
    include_content: v.optional(v.boolean()),
    include_summary: v.optional(v.boolean()),
  },
  async execute(args: any) {
    try {
      const client = getClient();
      const content = await client.getSourceContent(args.source_id);
      
      const result: Record<string, unknown> = {
        title: content.title,
        type: content.sourceType,
        url: content.url,
        char_count: content.charCount,
      };

      if (args.include_content) {
        result.content = content.content.length > 50000
          ? content.content.slice(0, 50000) + "\n[Truncated]"
          : content.content;
      }

      if (args.include_summary) {
        try {
          const guide = await client.getSourceGuide(args.source_id);
          result.summary = guide.summary;
          result.keywords = guide.keywords;
        } catch {}
      }

      return json(result);
    } catch (e: any) {
      return json({ status: "error", error: String(e) });
    }
  },
};

const source_delete = {
  description: "Delete source",
  args: {
    source_id: v.string(),
    confirm: v.boolean(),
  },
  async execute(args: any) {
    if (!args.confirm) return json({ status: "error", error: "Set confirm=true" });
    try {
      const client = getClient();
      await client.deleteSource(args.source_id);
      return json({ message: "Deleted" });
    } catch (e: any) {
      return json({ status: "error", error: String(e) });
    }
  },
};

const research_start = {
  description: "Start research",
  args: {
    query: v.string(),
    source: v.optional(v.string()),
    mode: v.optional(v.string()),
    notebook_id: v.optional(v.string()),
    title: v.optional(v.string()),
  },
  async execute(args: any) {
    try {
      const client = getClient();
      const result = await client.startResearch(
        args.query,
        (args.source as "web" | "drive") || "web",
        (args.mode as "fast" | "deep") || "fast",
        args.notebook_id,
        args.title
      );
      return json({
        notebook_id: result.notebookId,
        task_id: result.taskId,
        message: "Research started. Auto-imports when done.",
      });
    } catch (e: any) {
      return json({ status: "error", error: String(e) });
    }
  },
};

const studio_create = {
  description: "Generate studio content",
  args: {
    notebook_id: v.string(),
    type: v.string(),
    confirm: v.boolean(),
    focus_prompt: v.optional(v.string()),
    language: v.optional(v.string()),
  },
  async execute(args: any) {
    if (!args.confirm) return json({ status: "error", error: "Set confirm=true" });
    try {
      const client = getClient();
      
      if (args.type === "mind_map") {
        const result = await client.createMindMap(args.notebook_id);
        return json({ type: "mind_map", id: result.id });
      }

      const opts: Record<string, unknown> = {};
      if (args.focus_prompt) opts.focus_prompt = args.focus_prompt;
      if (args.language) opts.language = args.language;

      const artifactId = await client.createStudioContent(
        args.notebook_id,
        args.type as any,
        opts
      );

      return json({
        type: args.type,
        artifact_id: artifactId,
        message: "Generation started.",
      });
    } catch (e: any) {
      return json({ status: "error", error: String(e) });
    }
  },
};

const studio_delete = {
  description: "Delete studio artifact",
  args: {
    notebook_id: v.string(),
    artifact_id: v.string(),
    confirm: v.boolean(),
  },
  async execute(args: any) {
    if (!args.confirm) return json({ status: "error", error: "Set confirm=true" });
    try {
      const client = getClient();
      await client.deleteStudioArtifact(args.notebook_id, args.artifact_id);
      return json({ message: "Deleted" });
    } catch (e: any) {
      return json({ status: "error", error: String(e) });
    }
  },
};

const auth_save = {
  description: "Save auth tokens",
  args: {
    cookies: v.string(),
    csrf_token: v.optional(v.string()),
    session_id: v.optional(v.string()),
  },
  async execute(args: any) {
    try {
      const cookies = parseCookieHeader(args.cookies);

      if (!validateCookies(cookies)) {
        return json({
          status: "error",
          error: "Missing required cookies: SID, HSID, SSID, APISID, SAPISID",
        });
      }

      const tokens: AuthTokens = {
        cookies,
        csrfToken: args.csrf_token || "",
        sessionId: args.session_id || "",
        extractedAt: Date.now() / 1000,
      };

      saveTokensToCache(tokens);
      resetClient();

      return json({
        status: "success",
        message: "Auth tokens saved. CSRF will auto-refresh on first API call.",
      });
    } catch (e: any) {
      return json({ status: "error", error: String(e) });
    }
  }
};

// ============================================================================
// Plugin Export
// ============================================================================

export default async function plugin() {
  return {
    name: "notebooklm",
    tool: {
      notebook_list,
      notebook_create,
      notebook_get,
      notebook_query,
      notebook_delete,
      notebook_rename,
      notebook_add_url,
      notebook_add_text,
      notebook_add_drive,
      source_get,
      source_delete,
      research_start,
      studio_create,
      studio_delete,
      save_auth_tokens: auth_save,
    },
    hooks,
  };
}
