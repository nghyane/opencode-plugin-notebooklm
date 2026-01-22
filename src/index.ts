/**
 * OpenCode Plugin: NotebookLM v3
 * 
 * Optimized architecture:
 * - 10 smart tools (reduced from 15)
 * - Context inference (auto notebook_id)
 * - Auto-polling for long operations
 * - Unified source_add tool
 */

import { tool } from "@opencode-ai/plugin";
import { hooks } from "./hooks";
import { getClient, resetClient } from "./client/api";
import { saveTokensToCache, parseCookieHeader, validateCookies, type AuthTokens } from "./auth/tokens";
import { getState, setActiveNotebook, addPendingTask } from "./state/session";
import * as cache from "./state/cache";

// ============================================================================
// Helper
// ============================================================================

const json = (obj: unknown): string => JSON.stringify(obj, null, 2);

/**
 * Resolve notebook ID with smart inference
 */
async function resolveNotebookId(providedId?: string): Promise<string> {
  if (providedId) return providedId;
  
  // 1. Check session state first
  const state = getState();
  if (state.notebookId) return state.notebookId;
  
  // 2. Check cache (avoid race with session.created preload)
  const cached = cache.get<Array<{ id: string; title: string }>>(cache.key.notebooks());
  if (cached) {
    if (cached.length === 1) {
      setActiveNotebook(cached[0].id, cached[0].title);
      return cached[0].id;
    }
    if (cached.length === 0) {
      throw new Error("No notebooks found. Create one first with notebook_create.");
    }
    throw new Error(
      `Multiple notebooks exist (${cached.length}). Please specify notebook_id.\n` +
      `Available: ${cached.slice(0, 5).map(n => `${n.title} (${n.id})`).join(", ")}`
    );
  }
  
  // 3. Fetch from API if no cache
  const client = getClient();
  const notebooks = await client.listNotebooks();
  cache.set(cache.key.notebooks(), notebooks);
  
  if (notebooks.length === 1) {
    setActiveNotebook(notebooks[0].id, notebooks[0].title);
    return notebooks[0].id;
  }
  
  if (notebooks.length === 0) {
    throw new Error("No notebooks found. Create one first with notebook_create.");
  }
  
  throw new Error(
    `Multiple notebooks exist (${notebooks.length}). Please specify notebook_id.\n` +
    `Available: ${notebooks.slice(0, 5).map(n => `${n.title} (${n.id})`).join(", ")}`
  );
}

// ============================================================================
// Tool 1: notebook_list
// ============================================================================

const notebook_list = tool({
  description: "List all notebooks",
  args: {
    max_results: tool.schema.number().optional().describe("Max notebooks to return"),
  },
  async execute(args) {
    try {
      const cached = cache.get<unknown[]>(cache.key.notebooks());
      if (cached) {
        return json({ count: cached.length, notebooks: cached.slice(0, args.max_results ?? 20) });
      }

      const client = getClient();
      const notebooks = await client.listNotebooks();
      cache.set(cache.key.notebooks(), notebooks);

      // Auto-set if single notebook
      if (notebooks.length === 1) {
        setActiveNotebook(notebooks[0].id, notebooks[0].title);
      }

      const max = args.max_results ?? 20;
      return json({
        count: notebooks.length,
        notebooks: notebooks.slice(0, max).map((nb) => ({
          id: nb.id,
          title: nb.title,
          source_count: nb.sourceCount,
          url: `https://notebooklm.google.com/notebook/${nb.id}`,
        })),
      });
    } catch (e) {
      return json({ error: true, message: String(e) });
    }
  },
});

// ============================================================================
// Tool 2: notebook_create
// ============================================================================

const notebook_create = tool({
  description: "Create a new notebook",
  args: {
    title: tool.schema.string().optional().describe("Notebook title"),
  },
  async execute(args) {
    try {
      const client = getClient();
      const nb = await client.createNotebook(args.title || "");
      if (!nb) throw new Error("Failed to create notebook");

      cache.del(cache.key.notebooks());
      setActiveNotebook(nb.id, nb.title);

      return json({
        id: nb.id,
        title: nb.title,
        url: `https://notebooklm.google.com/notebook/${nb.id}`,
        message: "Notebook created and set as active.",
      });
    } catch (e) {
      return json({ error: true, message: String(e) });
    }
  },
});

// ============================================================================
// Tool 3: notebook_get
// ============================================================================

const notebook_get = tool({
  description: "Get notebook details. Use include_summary for AI summary.",
  args: {
    notebook_id: tool.schema.string().optional().describe("Notebook UUID (auto-inferred if single)"),
    include_summary: tool.schema.boolean().optional().describe("Include AI-generated summary"),
  },
  async execute(args) {
    try {
      const notebookId = await resolveNotebookId(args.notebook_id);
      const client = getClient();
      const raw = await client.getNotebook(notebookId);

      if (!raw || !Array.isArray(raw)) throw new Error("Notebook not found");

      const title = raw[0] || "Untitled";
      const sourcesData = Array.isArray(raw[1]) ? raw[1] : [];
      const sources = sourcesData.map((src: unknown[]) => ({
        id: Array.isArray(src[0]) ? src[0][0] : src[0],
        title: src[1] || "Untitled",
      }));

      setActiveNotebook(notebookId, title);

      const result: Record<string, unknown> = {
        id: notebookId,
        title,
        source_count: sources.length,
        sources: sources.slice(0, 20),
        url: `https://notebooklm.google.com/notebook/${notebookId}`,
      };

      if (args.include_summary) {
        try {
          const summary = await client.getNotebookSummary(notebookId);
          result.summary = summary.summary;
          result.suggested_topics = summary.suggestedTopics?.slice(0, 5);
        } catch { /* ignore summary errors */ }
      }

      return json(result);
    } catch (e) {
      return json({ error: true, message: String(e) });
    }
  },
});

// ============================================================================
// Tool 4: notebook_query
// ============================================================================

const notebook_query = tool({
  description: "Ask AI about sources in notebook",
  args: {
    query: tool.schema.string().describe("Question to ask"),
    notebook_id: tool.schema.string().optional().describe("Notebook UUID (auto-inferred)"),
    source_ids: tool.schema.string().optional().describe("Comma-separated source IDs to focus on"),
    conversation_id: tool.schema.string().optional().describe("Continue previous conversation"),
  },
  async execute(args) {
    try {
      const notebookId = await resolveNotebookId(args.notebook_id);
      const sourceIds = args.source_ids?.split(",").map((s) => s.trim());
      
      const client = getClient();
      const result = await client.query(notebookId, args.query, sourceIds, args.conversation_id);
      
      return json({
        answer: result.answer,
        conversation_id: result.conversationId,
        notebook_id: notebookId,
      });
    } catch (e) {
      return json({ error: true, message: String(e) });
    }
  },
});

// ============================================================================
// Tool 5: notebook_delete
// ============================================================================

const notebook_delete = tool({
  description: "Delete notebook permanently. IRREVERSIBLE.",
  args: {
    notebook_id: tool.schema.string().describe("Notebook UUID"),
    confirm: tool.schema.boolean().describe("Must be true to confirm deletion"),
  },
  async execute(args) {
    if (!args.confirm) {
      return json({ error: true, message: "Set confirm=true after user approval" });
    }
    try {
      const client = getClient();
      await client.deleteNotebook(args.notebook_id);
      
      cache.del(cache.key.notebooks());
      cache.del(cache.key.notebook(args.notebook_id));
      
      const state = getState();
      if (state.notebookId === args.notebook_id) {
        setActiveNotebook(null, null);
      }
      
      return json({ message: "Notebook deleted successfully" });
    } catch (e) {
      return json({ error: true, message: String(e) });
    }
  },
});

// ============================================================================
// Tool 6: notebook_rename
// ============================================================================

const notebook_rename = tool({
  description: "Rename a notebook",
  args: {
    notebook_id: tool.schema.string().describe("Notebook UUID"),
    new_title: tool.schema.string().describe("New title"),
  },
  async execute(args) {
    try {
      const client = getClient();
      await client.renameNotebook(args.notebook_id, args.new_title);
      
      cache.del(cache.key.notebooks());
      cache.del(cache.key.notebook(args.notebook_id));
      setActiveNotebook(args.notebook_id, args.new_title);
      
      return json({ id: args.notebook_id, title: args.new_title });
    } catch (e) {
      return json({ error: true, message: String(e) });
    }
  },
});

// ============================================================================
// Tool 7: source_add (UNIFIED - replaces notebook_add_url/text/drive)
// ============================================================================

const source_add = tool({
  description: "Add source to notebook. Auto-detects type: URL (http...), Drive ID (alphanumeric), or Text.",
  args: {
    content: tool.schema.string().describe("URL, Google Drive document ID, or text content"),
    notebook_id: tool.schema.string().optional().describe("Notebook UUID (auto-inferred)"),
    title: tool.schema.string().optional().describe("Title for text/drive sources"),
  },
  async execute(args) {
    try {
      const notebookId = await resolveNotebookId(args.notebook_id);
      const client = getClient();
      const content = args.content.trim();
      
      let source: Awaited<ReturnType<typeof client.addUrlSource>>;
      let sourceType: string;
      
      // Auto-detect type
      if (/^https?:\/\//i.test(content)) {
        // URL
        sourceType = "url";
        source = await client.addUrlSource(notebookId, content);
      } else if (/^[a-zA-Z0-9_-]{25,50}$/.test(content)) {
        // Google Drive ID pattern
        sourceType = "drive";
        source = await client.addDriveSource(
          notebookId, 
          content, 
          args.title || "Drive Document",
          "application/vnd.google-apps.document"
        );
      } else {
        // Text content
        sourceType = "text";
        source = await client.addTextSource(notebookId, content, args.title || "Pasted Text");
      }
      
      if (!source) throw new Error("Failed to add source");
      
      cache.del(cache.key.notebook(notebookId));
      
      return json({
        source,
        type: sourceType,
        notebook_id: notebookId,
      });
    } catch (e) {
      return json({ error: true, message: String(e) });
    }
  },
});

// ============================================================================
// Tool 8: source_get
// ============================================================================

const source_get = tool({
  description: "Get source content/metadata",
  args: {
    source_id: tool.schema.string().describe("Source UUID"),
    include_content: tool.schema.boolean().optional().describe("Include full text content"),
    include_summary: tool.schema.boolean().optional().describe("Include AI-generated summary"),
  },
  async execute(args) {
    try {
      const client = getClient();
      const content = await client.getSourceContent(args.source_id);

      const result: Record<string, unknown> = {
        id: args.source_id,
        title: content.title,
        type: content.sourceType,
        url: content.url,
        char_count: content.charCount,
      };

      if (args.include_content) {
        result.content = content.content.length > 50000
          ? content.content.slice(0, 50000) + "\n[Truncated at 50k chars]"
          : content.content;
      }

      if (args.include_summary) {
        try {
          const guide = await client.getSourceGuide(args.source_id);
          result.summary = guide.summary;
          result.keywords = guide.keywords;
        } catch { /* ignore */ }
      }

      cache.set(cache.key.source(args.source_id), result);
      return json(result);
    } catch (e) {
      return json({ error: true, message: String(e) });
    }
  },
});

// ============================================================================
// Tool 9: source_delete
// ============================================================================

const source_delete = tool({
  description: "Delete source from notebook",
  args: {
    source_id: tool.schema.string().describe("Source UUID"),
    confirm: tool.schema.boolean().describe("Must be true to confirm deletion"),
  },
  async execute(args) {
    if (!args.confirm) {
      return json({ error: true, message: "Set confirm=true after user approval" });
    }
    try {
      const client = getClient();
      await client.deleteSource(args.source_id);
      cache.del(cache.key.source(args.source_id));
      return json({ message: "Source deleted successfully" });
    } catch (e) {
      return json({ error: true, message: String(e) });
    }
  },
});

// ============================================================================
// Tool 10: research_start (with auto-polling)
// ============================================================================

const research_start = tool({
  description: "Start web research. Blocks until complete by default (use wait=false for async).",
  args: {
    query: tool.schema.string().describe("Research query"),
    notebook_id: tool.schema.string().optional().describe("Add to existing notebook (auto-inferred)"),
    source: tool.schema.string().optional().describe("web|scholar (default: web)"),
    mode: tool.schema.string().optional().describe("quick|deep (default: quick)"),
    title: tool.schema.string().optional().describe("New notebook title if no notebook_id"),
    wait: tool.schema.boolean().optional().describe("Wait for completion (default: true)"),
    max_wait: tool.schema.number().optional().describe("Max wait seconds (default: 120)"),
  },
  async execute(args) {
    try {
      const client = getClient();
      const wait = args.wait !== false;
      const maxWait = (args.max_wait ?? 120) * 1000;
      
      // Resolve or create notebook
      let notebookId: string;
      if (args.notebook_id) {
        notebookId = args.notebook_id;
      } else {
        try {
          notebookId = await resolveNotebookId();
        } catch {
          // Create new notebook
          const nb = await client.createNotebook(args.title || `Research: ${args.query.slice(0, 30)}`);
          if (!nb) throw new Error("Failed to create notebook");
          notebookId = nb.id;
          setActiveNotebook(nb.id, nb.title);
        }
      }
      
      const task = await client.startResearch(
        args.query,
        (args.source as "web" | "drive") || "web",
        (args.mode as "fast" | "deep") || "fast",
        notebookId,
        args.title
      );
      
      if (!wait) {
        // Register pending task for background polling
        addPendingTask({
          id: task.taskId,
          type: 'research',
          notebookId,
          status: 'pending',
          startedAt: Date.now(),
        });
        
        return json({
          task_id: task.taskId,
          notebook_id: notebookId,
          status: "pending",
          message: "Research started. Check back later or use session.idle hook.",
        });
      }
      
      // Poll until complete
      const startTime = Date.now();
      const pollInterval = 3000;
      
      while (Date.now() - startTime < maxWait) {
        await new Promise(r => setTimeout(r, pollInterval));
        
        const status = await client.pollResearch(notebookId, task.taskId);
        
        if (status.status === "completed") {
          // Auto-import sources (returns count)
          const importCount = await client.importResearchSources(notebookId, task.taskId);
          cache.del(cache.key.notebook(notebookId));
          
          return json({
            task_id: task.taskId,
            notebook_id: notebookId,
            status: "completed",
            sources_imported: importCount,
          });
        }
        
        if (status.status === "failed") {
          return json({
            error: true,
            task_id: task.taskId,
            message: "Research failed",
          });
        }
      }
      
      return json({
        task_id: task.taskId,
        notebook_id: notebookId,
        status: "timeout",
        message: `Research still running after ${args.max_wait ?? 120}s. Check back later.`,
      });
    } catch (e) {
      return json({ error: true, message: String(e) });
    }
  },
});

// ============================================================================
// Tool 11: studio_create (with auto-polling)
// ============================================================================

const studio_create = tool({
  description: "Generate studio content. Blocks until complete by default.",
  args: {
    type: tool.schema.string().describe("audio|video|infographic|slide_deck|report|flashcards|quiz|data_table|mindmap"),
    notebook_id: tool.schema.string().optional().describe("Notebook UUID (auto-inferred)"),
    focus_prompt: tool.schema.string().optional().describe("Focus topic or custom instructions"),
    language: tool.schema.string().optional().describe("Language code (default: en)"),
    confirm: tool.schema.boolean().describe("Must be true to start generation"),
    wait: tool.schema.boolean().optional().describe("Wait for completion (default: true)"),
    max_wait: tool.schema.number().optional().describe("Max wait seconds (default: 180)"),
  },
  async execute(args) {
    if (!args.confirm) {
      return json({ error: true, message: "Set confirm=true to start generation" });
    }
    
    try {
      const notebookId = await resolveNotebookId(args.notebook_id);
      const client = getClient();
      const wait = args.wait !== false;
      const maxWait = (args.max_wait ?? 180) * 1000;
      
      // Handle mindmap separately
      if (args.type === "mindmap" || args.type === "mind_map") {
        const result = await client.createMindMap(notebookId);
        return json({
          type: "mindmap",
          id: result.id,
          notebook_id: notebookId,
          status: "complete",
        });
      }
      
      const opts: Record<string, unknown> = {};
      if (args.focus_prompt) opts.focusPrompt = args.focus_prompt;
      if (args.language) opts.language = args.language;
      
      // createStudioContent returns artifact ID string
      const artifactId = await client.createStudioContent(notebookId, args.type as any, opts);
      
      if (!wait) {
        // Register pending task for background polling
        addPendingTask({
          id: artifactId,
          type: 'studio',
          notebookId,
          status: 'pending',
          startedAt: Date.now(),
        });
        
        return json({
          artifact_id: artifactId,
          type: args.type,
          notebook_id: notebookId,
          status: "pending",
          message: "Generation started. Check back later.",
        });
      }
      
      // Poll until complete - pollStudioStatus returns StudioArtifact[]
      const startTime = Date.now();
      const pollInterval = 5000;
      
      while (Date.now() - startTime < maxWait) {
        await new Promise(r => setTimeout(r, pollInterval));
        
        const artifacts = await client.pollStudioStatus(notebookId);
        const artifact = artifacts.find(a => a.id === artifactId);
        
        if (artifact?.status === "ready") {
          return json({
            artifact_id: artifactId,
            type: args.type,
            notebook_id: notebookId,
            status: "ready",
            content: artifact,
          });
        }
        
        if (artifact?.status === "failed") {
          return json({
            error: true,
            artifact_id: artifactId,
            message: "Generation failed",
          });
        }
      }
      
      return json({
        artifact_id: artifactId,
        type: args.type,
        notebook_id: notebookId,
        status: "timeout",
        message: `Generation still running after ${args.max_wait ?? 180}s.`,
      });
    } catch (e) {
      return json({ error: true, message: String(e) });
    }
  },
});

// ============================================================================
// Tool 12: studio_delete
// ============================================================================

const studio_delete = tool({
  description: "Delete studio artifact",
  args: {
    artifact_id: tool.schema.string().describe("Artifact UUID"),
    notebook_id: tool.schema.string().optional().describe("Notebook UUID (auto-inferred)"),
    confirm: tool.schema.boolean().describe("Must be true to confirm deletion"),
  },
  async execute(args) {
    if (!args.confirm) {
      return json({ error: true, message: "Set confirm=true after user approval" });
    }
    try {
      const notebookId = await resolveNotebookId(args.notebook_id);
      const client = getClient();
      await client.deleteStudioArtifact(notebookId, args.artifact_id);
      return json({ message: "Artifact deleted successfully" });
    } catch (e) {
      return json({ error: true, message: String(e) });
    }
  },
});

// ============================================================================
// Tool 13: save_auth_tokens
// ============================================================================

const save_auth_tokens = tool({
  description: "Save auth tokens from browser cookies",
  args: {
    cookies: tool.schema.string().describe("Cookie header string from browser"),
    csrf_token: tool.schema.string().optional().describe("CSRF token (auto-refreshes if not provided)"),
    session_id: tool.schema.string().optional().describe("Session ID"),
  },
  async execute(args) {
    try {
      const cookies = parseCookieHeader(args.cookies);

      if (!validateCookies(cookies)) {
        return json({
          error: true,
          message: "Missing required cookies. Need: SID, HSID, SSID, APISID, SAPISID",
          suggestion: "Open https://notebooklm.google.com > DevTools (F12) > Network > any request > copy Cookie header",
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
    } catch (e) {
      return json({ error: true, message: String(e) });
    }
  },
});

// ============================================================================
// Plugin Export
// ============================================================================

export default async function plugin() {
  return {
    name: "notebooklm",
    tool: {
      // Notebook operations (6)
      notebook_list,
      notebook_create,
      notebook_get,
      notebook_query,
      notebook_delete,
      notebook_rename,
      // Source operations (3) - unified add
      source_add,
      source_get,
      source_delete,
      // Research & Studio (3) - with auto-polling
      research_start,
      studio_create,
      studio_delete,
      // Auth (1)
      save_auth_tokens,
    },
    hooks,
  };
}
