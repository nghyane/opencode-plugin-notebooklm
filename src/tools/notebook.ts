/**
 * Notebook Tools
 * 
 * Tools for managing NotebookLM notebooks
 */

import { getClient, resetClient } from "../client/api";
import type { ToolResult, Notebook, ChatConfig } from "../types";

// ============================================================================
// Tool Definitions (OpenCode Custom Tools format)
// ============================================================================

/**
 * List all notebooks
 */
export async function notebook_list(args: {
  max_results?: number;
}): Promise<ToolResult> {
  try {
    const client = getClient();
    const notebooks = await client.listNotebooks();
    const maxResults = args.max_results ?? 100;

    const ownedCount = notebooks.filter((nb) => nb.isOwned).length;
    const sharedCount = notebooks.length - ownedCount;
    const sharedByMeCount = notebooks.filter((nb) => nb.isOwned && nb.isShared).length;

    return {
      status: "success",
      count: notebooks.length,
      owned_count: ownedCount,
      shared_count: sharedCount,
      shared_by_me_count: sharedByMeCount,
      notebooks: notebooks.slice(0, maxResults).map((nb) => ({
        id: nb.id,
        title: nb.title,
        source_count: nb.sourceCount,
        url: `https://notebooklm.google.com/notebook/${nb.id}`,
        ownership: nb.isOwned ? "owned" : "shared",
        is_shared: nb.isShared,
        created_at: nb.createdAt,
        modified_at: nb.modifiedAt,
      })),
    };
  } catch (e) {
    return { status: "error", error: String(e) };
  }
}

/**
 * Create a new notebook
 */
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

/**
 * Get notebook details with sources
 */
export async function notebook_get(args: {
  notebook_id: string;
}): Promise<ToolResult> {
  try {
    const client = getClient();
    const result = await client.getNotebook(args.notebook_id);

    return {
      status: "success",
      notebook: result,
    };
  } catch (e) {
    return { status: "error", error: String(e) };
  }
}

/**
 * Get AI-generated notebook summary with suggested topics
 */
export async function notebook_describe(args: {
  notebook_id: string;
}): Promise<ToolResult> {
  try {
    const client = getClient();
    const result = await client.getNotebookSummary(args.notebook_id);

    return {
      status: "success",
      summary: result.summary,
      suggested_topics: result.suggestedTopics,
    };
  } catch (e) {
    return { status: "error", error: String(e) };
  }
}

/**
 * Ask AI about sources in notebook
 */
export async function notebook_query(args: {
  notebook_id: string;
  query: string;
  source_ids?: string[] | string;
  conversation_id?: string;
  timeout?: number;
}): Promise<ToolResult> {
  try {
    // Handle source_ids as JSON string (common from AI clients)
    let sourceIds: string[] | undefined;
    const rawSourceIds = args.source_ids;
    if (typeof rawSourceIds === "string") {
      try {
        sourceIds = JSON.parse(rawSourceIds);
      } catch {
        sourceIds = [rawSourceIds];
      }
    } else {
      sourceIds = rawSourceIds;
    }

    const client = getClient();
    const result = await client.query(
      args.notebook_id,
      args.query,
      sourceIds,
      args.conversation_id,
      args.timeout
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

/**
 * Delete notebook permanently
 */
export async function notebook_delete(args: {
  notebook_id: string;
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
    const result = await client.deleteNotebook(args.notebook_id);

    if (result) {
      return {
        status: "success",
        message: `Notebook ${args.notebook_id} has been permanently deleted.`,
      };
    }
    return { status: "error", error: "Failed to delete notebook" };
  } catch (e) {
    return { status: "error", error: String(e) };
  }
}

/**
 * Rename a notebook
 */
export async function notebook_rename(args: {
  notebook_id: string;
  new_title: string;
}): Promise<ToolResult> {
  try {
    const client = getClient();
    const result = await client.renameNotebook(args.notebook_id, args.new_title);

    if (result) {
      return {
        status: "success",
        notebook: {
          id: args.notebook_id,
          title: args.new_title,
        },
      };
    }
    return { status: "error", error: "Failed to rename notebook" };
  } catch (e) {
    return { status: "error", error: String(e) };
  }
}

/**
 * Add URL (website or YouTube) as source
 */
export async function notebook_add_url(args: {
  notebook_id: string;
  url: string;
}): Promise<ToolResult> {
  try {
    const client = getClient();
    const result = await client.addUrlSource(args.notebook_id, args.url);

    if (result) {
      return {
        status: "success",
        source: result,
      };
    }
    return { status: "error", error: "Failed to add URL source" };
  } catch (e) {
    return { status: "error", error: String(e) };
  }
}

/**
 * Add pasted text as source
 */
export async function notebook_add_text(args: {
  notebook_id: string;
  text: string;
  title?: string;
}): Promise<ToolResult> {
  try {
    const client = getClient();
    const result = await client.addTextSource(
      args.notebook_id,
      args.text,
      args.title || "Pasted Text"
    );

    if (result) {
      return {
        status: "success",
        source: result,
      };
    }
    return { status: "error", error: "Failed to add text source" };
  } catch (e) {
    return { status: "error", error: String(e) };
  }
}

/**
 * Add Google Drive document as source
 */
export async function notebook_add_drive(args: {
  notebook_id: string;
  document_id: string;
  title: string;
  doc_type?: string;
}): Promise<ToolResult> {
  try {
    const mimeTypes: Record<string, string> = {
      doc: "application/vnd.google-apps.document",
      docs: "application/vnd.google-apps.document",
      slides: "application/vnd.google-apps.presentation",
      sheets: "application/vnd.google-apps.spreadsheet",
      pdf: "application/pdf",
    };

    const docType = args.doc_type?.toLowerCase() || "doc";
    const mimeType = mimeTypes[docType];

    if (!mimeType) {
      return {
        status: "error",
        error: `Unknown doc_type '${docType}'. Use 'doc', 'slides', 'sheets', or 'pdf'.`,
      };
    }

    const client = getClient();
    const result = await client.addDriveSource(
      args.notebook_id,
      args.document_id,
      args.title,
      mimeType
    );

    if (result) {
      return {
        status: "success",
        source: result,
      };
    }
    return { status: "error", error: "Failed to add Drive source" };
  } catch (e) {
    return { status: "error", error: String(e) };
  }
}

/**
 * Configure notebook chat settings
 */
export async function chat_configure(args: {
  notebook_id: string;
  goal?: "default" | "learning_guide" | "custom";
  custom_prompt?: string;
  response_length?: "default" | "longer" | "shorter";
}): Promise<ToolResult> {
  try {
    const config: ChatConfig = {
      goal: args.goal || "default",
      customPrompt: args.custom_prompt,
      responseLength: args.response_length || "default",
    };

    if (config.goal === "custom" && !config.customPrompt) {
      return {
        status: "error",
        error: "custom_prompt is required when goal='custom'",
      };
    }

    const client = getClient();
    const result = await client.configureChat(args.notebook_id, config);

    if (result) {
      return {
        status: "success",
        message: "Chat settings configured successfully",
      };
    }
    return { status: "error", error: "Failed to configure chat" };
  } catch (e) {
    return { status: "error", error: String(e) };
  }
}

// Export tool metadata for OpenCode
export const notebookToolsMetadata = {
  notebook_list: {
    description: "List all notebooks",
    args: {
      max_results: { type: "number", optional: true, description: "Maximum number of notebooks to return (default: 100)" },
    },
  },
  notebook_create: {
    description: "Create a new notebook",
    args: {
      title: { type: "string", optional: true, description: "Optional title for the notebook" },
    },
  },
  notebook_get: {
    description: "Get notebook details with sources",
    args: {
      notebook_id: { type: "string", required: true, description: "Notebook UUID" },
    },
  },
  notebook_describe: {
    description: "Get AI-generated notebook summary with suggested topics",
    args: {
      notebook_id: { type: "string", required: true, description: "Notebook UUID" },
    },
  },
  notebook_query: {
    description: "Ask AI about EXISTING sources already in notebook. NOT for finding new sources. Use research_start for deep research.",
    args: {
      notebook_id: { type: "string", required: true, description: "Notebook UUID" },
      query: { type: "string", required: true, description: "Question to ask" },
      source_ids: { type: "array", optional: true, description: "Source IDs to query (default: all)" },
      conversation_id: { type: "string", optional: true, description: "For follow-up questions" },
      timeout: { type: "number", optional: true, description: "Request timeout in seconds" },
    },
  },
  notebook_delete: {
    description: "Delete notebook permanently. IRREVERSIBLE. Requires confirm=true",
    args: {
      notebook_id: { type: "string", required: true, description: "Notebook UUID" },
      confirm: { type: "boolean", optional: true, description: "Must be true after user approval" },
    },
  },
  notebook_rename: {
    description: "Rename a notebook",
    args: {
      notebook_id: { type: "string", required: true, description: "Notebook UUID" },
      new_title: { type: "string", required: true, description: "New title" },
    },
  },
  notebook_add_url: {
    description: "Add URL (website or YouTube) as source",
    args: {
      notebook_id: { type: "string", required: true, description: "Notebook UUID" },
      url: { type: "string", required: true, description: "URL to add" },
    },
  },
  notebook_add_text: {
    description: "Add pasted text as source",
    args: {
      notebook_id: { type: "string", required: true, description: "Notebook UUID" },
      text: { type: "string", required: true, description: "Text content to add" },
      title: { type: "string", optional: true, description: "Optional title" },
    },
  },
  notebook_add_drive: {
    description: "Add Google Drive document as source",
    args: {
      notebook_id: { type: "string", required: true, description: "Notebook UUID" },
      document_id: { type: "string", required: true, description: "Drive document ID (from URL)" },
      title: { type: "string", required: true, description: "Display title" },
      doc_type: { type: "string", optional: true, description: "doc|slides|sheets|pdf (default: doc)" },
    },
  },
  chat_configure: {
    description: "Configure notebook chat settings",
    args: {
      notebook_id: { type: "string", required: true, description: "Notebook UUID" },
      goal: { type: "string", optional: true, description: "default|learning_guide|custom" },
      custom_prompt: { type: "string", optional: true, description: "Required when goal=custom (max 10000 chars)" },
      response_length: { type: "string", optional: true, description: "default|longer|shorter" },
    },
  },
};
