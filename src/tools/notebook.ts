/**
 * Notebook Tools v2
 * 
 * Optimized tools - merged notebook_get + notebook_describe
 */

import { getClient } from "../client/api";
import type { ToolResult, ChatConfig } from "../types";

// ============================================================================
// notebook_list
// ============================================================================

export async function notebook_list(args: {
  max_results?: number;
}): Promise<ToolResult> {
  try {
    const client = getClient();
    const notebooks = await client.listNotebooks();
    const maxResults = args.max_results ?? 20;

    return {
      status: "success",
      count: notebooks.length,
      notebooks: notebooks.slice(0, maxResults).map((nb) => ({
        id: nb.id,
        title: nb.title,
        source_count: nb.sourceCount,
        url: `https://notebooklm.google.com/notebook/${nb.id}`,
        ownership: nb.isOwned ? "owned" : "shared",
      })),
    };
  } catch (e) {
    return { status: "error", error: String(e) };
  }
}

// ============================================================================
// notebook_create
// ============================================================================

export async function notebook_create(args: {
  title?: string;
}): Promise<ToolResult> {
  try {
    const client = getClient();
    const notebook = await client.createNotebook(args.title || "");

    if (notebook) {
      return {
        status: "success",
        notebook: {
          id: notebook.id,
          title: notebook.title,
          url: `https://notebooklm.google.com/notebook/${notebook.id}`,
        },
      };
    }
    return { status: "error", error: "Failed to create notebook" };
  } catch (e) {
    return { status: "error", error: String(e) };
  }
}

// ============================================================================
// notebook_get (merged with notebook_describe)
// ============================================================================

export async function notebook_get(args: {
  notebook_id: string;
  include_summary?: boolean;
}): Promise<ToolResult> {
  try {
    const client = getClient();
    const notebook = await client.getNotebook(args.notebook_id);

    if (!notebook || !Array.isArray(notebook)) {
      return { status: "error", error: "Notebook not found" };
    }

    const title = notebook[0] || "Untitled";
    const sourcesData = notebook[1] || [];
    
    // Extract sources
    const sources = Array.isArray(sourcesData)
      ? sourcesData.map((src: unknown[]) => ({
          id: Array.isArray(src[0]) ? src[0][0] : src[0],
          title: src[1] || "Untitled",
        }))
      : [];

    const result: ToolResult = {
      status: "success",
      id: args.notebook_id,
      title,
      source_count: sources.length,
      sources: sources.slice(0, 20), // Limit for token optimization
      url: `https://notebooklm.google.com/notebook/${args.notebook_id}`,
    };

    // Optionally include AI summary
    if (args.include_summary) {
      try {
        const summary = await client.getNotebookSummary(args.notebook_id);
        result.summary = summary.summary;
        result.suggested_topics = summary.suggestedTopics.slice(0, 5);
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
// notebook_query
// ============================================================================

export async function notebook_query(args: {
  notebook_id: string;
  query: string;
  source_ids?: string[];
  conversation_id?: string;
}): Promise<ToolResult> {
  try {
    let sourceIds: string[] | undefined = args.source_ids;
    if (typeof args.source_ids === "string") {
      try {
        sourceIds = JSON.parse(args.source_ids) as string[];
      } catch {
        sourceIds = [args.source_ids];
      }
    }

    const client = getClient();
    const result = await client.query(
      args.notebook_id,
      args.query,
      sourceIds,
      args.conversation_id
    );

    return {
      status: "success",
      answer: result.answer,
      conversation_id: result.conversationId,
    };
  } catch (e) {
    return { status: "error", error: String(e) };
  }
}

// ============================================================================
// notebook_delete
// ============================================================================

export async function notebook_delete(args: {
  notebook_id: string;
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
    await client.deleteNotebook(args.notebook_id);
    return { status: "success", message: "Notebook deleted." };
  } catch (e) {
    return { status: "error", error: String(e) };
  }
}

// ============================================================================
// notebook_rename
// ============================================================================

export async function notebook_rename(args: {
  notebook_id: string;
  new_title: string;
}): Promise<ToolResult> {
  try {
    const client = getClient();
    await client.renameNotebook(args.notebook_id, args.new_title);
    return { status: "success", title: args.new_title };
  } catch (e) {
    return { status: "error", error: String(e) };
  }
}

// ============================================================================
// notebook_add_url
// ============================================================================

export async function notebook_add_url(args: {
  notebook_id: string;
  url: string;
}): Promise<ToolResult> {
  try {
    const client = getClient();
    const source = await client.addUrlSource(args.notebook_id, args.url);
    return source
      ? { status: "success", source }
      : { status: "error", error: "Failed to add URL" };
  } catch (e) {
    return { status: "error", error: String(e) };
  }
}

// ============================================================================
// notebook_add_text
// ============================================================================

export async function notebook_add_text(args: {
  notebook_id: string;
  text: string;
  title?: string;
}): Promise<ToolResult> {
  try {
    const client = getClient();
    const source = await client.addTextSource(
      args.notebook_id,
      args.text,
      args.title || "Pasted Text"
    );
    return source
      ? { status: "success", source }
      : { status: "error", error: "Failed to add text" };
  } catch (e) {
    return { status: "error", error: String(e) };
  }
}

// ============================================================================
// notebook_add_drive
// ============================================================================

export async function notebook_add_drive(args: {
  notebook_id: string;
  document_id: string;
  title: string;
  doc_type?: "doc" | "slides" | "sheets" | "pdf";
}): Promise<ToolResult> {
  const mimeTypes: Record<string, string> = {
    doc: "application/vnd.google-apps.document",
    slides: "application/vnd.google-apps.presentation",
    sheets: "application/vnd.google-apps.spreadsheet",
    pdf: "application/pdf",
  };

  const mimeType = mimeTypes[args.doc_type || "doc"];
  if (!mimeType) {
    return { status: "error", error: "Invalid doc_type" };
  }

  try {
    const client = getClient();
    const source = await client.addDriveSource(
      args.notebook_id,
      args.document_id,
      args.title,
      mimeType
    );
    return source
      ? { status: "success", source }
      : { status: "error", error: "Failed to add Drive source" };
  } catch (e) {
    return { status: "error", error: String(e) };
  }
}

// ============================================================================
// chat_configure
// ============================================================================

export async function chat_configure(args: {
  notebook_id: string;
  goal?: "default" | "learning_guide" | "custom";
  custom_prompt?: string;
  response_length?: "default" | "longer" | "shorter";
}): Promise<ToolResult> {
  if (args.goal === "custom" && !args.custom_prompt) {
    return { status: "error", error: "custom_prompt required for custom goal" };
  }

  try {
    const config: ChatConfig = {
      goal: args.goal || "default",
      customPrompt: args.custom_prompt,
      responseLength: args.response_length || "default",
    };

    const client = getClient();
    await client.configureChat(args.notebook_id, config);
    return { status: "success", message: "Chat configured" };
  } catch (e) {
    return { status: "error", error: String(e) };
  }
}
