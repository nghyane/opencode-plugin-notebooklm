/**
 * NotebookLM Plugin - OpenCode Native Integration
 * Tools only - Skills use OpenCode native skill system
 * Skills location: ~/.config/opencode/skills/nlm-{name}/SKILL.md
 */

import { tool } from "@opencode-ai/plugin";
import type { Hooks } from "@opencode-ai/plugin";
import { getClient, resetClient } from "./client";
import { saveTokensToCache, parseCookieHeader, validateCookies, type AuthTokens } from "./auth/tokens";
import { AppError } from "./errors";
import { getState, updateState, setActiveNotebook, addPendingTask } from "./state/session";
import * as cache from "./state/cache";

const json = (data: unknown) => JSON.stringify(data, null, 2);

const notebook_list = tool({
  description: "List NotebookLM notebooks. Use skill({name:'nlm-list'}) for detailed workflow.",
  args: {
    max_results: tool.schema.number().optional().describe("Limit results"),
  },
  async execute(args) {
    try {
      const client = await getClient();
      let notebooks = await client.listNotebooks();
      cache.set("notebooks", notebooks, "notebooks");
      if (args.max_results) notebooks = notebooks.slice(0, args.max_results);
      if (notebooks.length > 0) setActiveNotebook(notebooks[0]!.id, notebooks[0]!.title);
      return json({
        notebooks: notebooks.map(n => ({ id: n.id, title: n.title, sources: n.sourceCount, url: `https://notebooklm.google.com/notebook/${n.id}` })),
        count: notebooks.length,
      });
    } catch (e) {
      if (e instanceof AppError) return json({ error: e.toJSON() });
      return json({ error: { message: String(e), code: "UNKNOWN" } });
    }
  },
});

const notebook_query = tool({
  description: "Ask AI about notebook sources. Multi-turn via conversation_id. Use skill({name:'nlm-query'}) for help.",
  args: {
    query: tool.schema.string().describe("Your question"),
    notebook_id: tool.schema.string().optional().describe("Notebook ID"),
    source_ids: tool.schema.string().optional().describe("Comma-separated source IDs"),
    conversation_id: tool.schema.string().optional().describe("Continue conversation"),
  },
  async execute(args) {
    try {
      const client = await getClient();
      const state = getState();
      const notebookId = args.notebook_id || state.notebookId;
      if (!notebookId) return json({ error: "No notebook. Run notebook_list first." });
      const sourceIds = args.source_ids?.split(",").map(s => s.trim());
      const result = await client.query(notebookId, args.query, sourceIds, args.conversation_id);
      updateState({ conversationId: result.conversationId, lastQuery: args.query, lastAnswer: result.answer });
      return json({ answer: result.answer, conversation_id: result.conversationId });
    } catch (e) {
      if (e instanceof AppError) return json({ error: e.toJSON() });
      return json({ error: { message: String(e), code: "UNKNOWN" } });
    }
  },
});

const notebook_get = tool({
  description: "Get notebook details and AI summary.",
  args: {
    notebook_id: tool.schema.string().optional().describe("Notebook ID"),
    include_summary: tool.schema.boolean().optional().describe("Include AI summary"),
  },
  async execute(args) {
    try {
      const client = await getClient();
      const state = getState();
      const notebookId = args.notebook_id || state.notebookId;
      if (!notebookId) return json({ error: "No notebook selected" });
      const [nbData, summary] = await Promise.all([
        client.getNotebook(notebookId),
        args.include_summary !== false ? client.getNotebookSummary(notebookId) : null,
      ]);
      return json({ notebook: nbData, summary: summary?.summary, suggested_topics: summary?.suggestedTopics, url: `https://notebooklm.google.com/notebook/${notebookId}` });
    } catch (e) {
      if (e instanceof AppError) return json({ error: e.toJSON() });
      return json({ error: { message: String(e), code: "UNKNOWN" } });
    }
  },
});

const notebook_create = tool({
  description: "Create new notebook.",
  args: { title: tool.schema.string().optional().describe("Notebook title") },
  async execute(args) {
    try {
      const client = await getClient();
      const nb = await client.createNotebook(args.title);
      if (nb) { setActiveNotebook(nb.id, nb.title); cache.del("notebooks"); return json({ created: nb, url: `https://notebooklm.google.com/notebook/${nb.id}` }); }
      return json({ error: "Failed" });
    } catch (e) {
      if (e instanceof AppError) return json({ error: e.toJSON() });
      return json({ error: { message: String(e), code: "UNKNOWN" } });
    }
  },
});

const source_add = tool({
  description: "Add source to notebook. Specify type explicitly: urls, drive, or text.",
  args: {
    urls: tool.schema.string().optional().describe("URL(s) separated by space/newline (websites, YouTube)"),
    drive_id: tool.schema.string().optional().describe("Google Drive document ID"),
    text: tool.schema.string().optional().describe("Plain text content"),
    title: tool.schema.string().optional().describe("Title (required for text, optional for drive)"),
    notebook_id: tool.schema.string().optional().describe("Target notebook"),
  },
  async execute(args) {
    try {
      const client = await getClient();
      const state = getState();
      const notebookId = args.notebook_id || state.notebookId;
      if (!notebookId) return json({ error: "No notebook. Run notebook_list first." });

      // URLs (websites, YouTube)
      if (args.urls) {
        const urlList = args.urls.trim().split(/[\s\n]+/).filter(u => u.startsWith("http"));
        if (urlList.length === 0) return json({ error: "No valid URLs found" });
        if (urlList.length === 1) {
          const source = await client.addUrlSource(notebookId, urlList[0]!);
          return json(source ? { added: source } : { error: "Failed to add URL" });
        }
        const sources = await client.addUrlSources(notebookId, urlList);
        return json(sources.length > 0 ? { added: sources, count: sources.length } : { error: "Failed to add URLs" });
      }

      // Google Drive
      if (args.drive_id) {
        const source = await client.addDriveSource(notebookId, args.drive_id, args.title || "Drive Document", "application/vnd.google-apps.document");
        return json(source ? { added: source } : { error: "Failed to add Drive document" });
      }

      // Text
      if (args.text) {
        if (!args.title) return json({ error: "Title required for text source" });
        const source = await client.addTextSource(notebookId, args.text, args.title);
        return json(source ? { added: source } : { error: "Failed to add text" });
      }

      return json({ error: "Provide urls, drive_id, or text" });
    } catch (e) {
      if (e instanceof AppError) return json({ error: e.toJSON() });
      return json({ error: { message: String(e), code: "UNKNOWN" } });
    }
  },
});

const research_start = tool({
  description: "Start web research. Use skill({name:'nlm-research'}) for workflow.",
  args: {
    query: tool.schema.string().describe("Research topic"),
    mode: tool.schema.enum(["fast", "deep"]).optional().describe("Depth"),
    source: tool.schema.enum(["web", "drive"]).optional().describe("Source type"),
    notebook_id: tool.schema.string().optional().describe("Existing notebook"),
    title: tool.schema.string().optional().describe("New notebook title"),
    wait: tool.schema.boolean().optional().describe("Wait for completion"),
  },
  async execute(args) {
    try {
      const client = await getClient();
      const state = getState();
      const result = await client.startResearch(args.query, args.source, args.mode, args.notebook_id || state.notebookId || undefined, args.title);
      addPendingTask({ id: result.taskId || crypto.randomUUID(), type: "research", notebookId: result.notebookId, status: "pending", startedAt: Date.now() });
      if (args.wait) {
        for (let i = 0; i < 30; i++) {
          await new Promise(r => setTimeout(r, 2000));
          const status = await client.pollResearch(result.notebookId);
          if (status.status === "completed") return json({ completed: status });
          if (status.status === "failed") return json({ failed: status });
        }
      }
      return json({ started: result });
    } catch (e) {
      if (e instanceof AppError) return json({ error: e.toJSON() });
      return json({ error: { message: String(e), code: "UNKNOWN" } });
    }
  },
});

const studio_create = tool({
  description: "Generate AI content (audio/report/flashcards). Use skill({name:'nlm-studio'}) for help.",
  args: {
    type: tool.schema.enum(["audio", "report", "flashcards", "infographic", "slide_deck", "data_table"]).describe("Content type"),
    notebook_id: tool.schema.string().optional().describe("Source notebook"),
    focus_prompt: tool.schema.string().optional().describe("Focus topic"),
    language: tool.schema.string().optional().describe("Output language"),
  },
  async execute(args) {
    try {
      const client = await getClient();
      const state = getState();
      const notebookId = args.notebook_id || state.notebookId;
      if (!notebookId) return json({ error: "No notebook" });
      const opts: Record<string, unknown> = {};
      if (args.focus_prompt) opts["focus_prompt"] = args.focus_prompt;
      if (args.language) opts["language"] = args.language;
      const artifactId = await client.createStudioContent(notebookId, args.type, opts);
      addPendingTask({ id: artifactId || crypto.randomUUID(), type: "studio", notebookId, status: "pending", startedAt: Date.now() });
      return json({ started: { artifactId, type: args.type }, estimated: args.type === "audio" ? "2-5 min" : "30-60 sec" });
    } catch (e) {
      if (e instanceof AppError) return json({ error: e.toJSON() });
      return json({ error: { message: String(e), code: "UNKNOWN" } });
    }
  },
});

const save_auth_tokens = tool({
  description: "Save NotebookLM auth cookies from browser DevTools.",
  args: {
    cookies: tool.schema.string().describe("Cookie header string"),
    csrf_token: tool.schema.string().optional(),
    session_id: tool.schema.string().optional(),
  },
  async execute(args) {
    try {
      const parsed = parseCookieHeader(args.cookies);
      if (!validateCookies(parsed)) return json({ error: "Invalid cookies" });
      saveTokensToCache({ cookies: parsed, csrfToken: args.csrf_token || "", sessionId: args.session_id || "", extractedAt: Date.now() / 1000 }, true);
      resetClient();
      return json({ success: true, next: "Run notebook_list to see notebooks" });
    } catch (e) {
      if (e instanceof AppError) return json({ error: e.toJSON() });
      return json({ error: { message: String(e), code: "UNKNOWN" } });
    }
  },
});

import { hooks as pluginHooks, setPluginContext } from './hooks';

export default async function plugin(ctx: { client: unknown }) {
  // Set plugin context for hooks to use
  setPluginContext(ctx as Parameters<typeof setPluginContext>[0]);
  
  return {
    tool: { notebook_list, notebook_query, notebook_get, notebook_create, source_add, research_start, studio_create, save_auth_tokens },
    ...pluginHooks,
  };
}
