/**
 * Studio Tools
 * 
 * Tools for generating audio overviews, videos, infographics, slide decks, reports,
 * flashcards, quizzes, data tables, and mind maps
 */

import { getClient } from "../client/api";
import type { ToolResult, CONSTANTS } from "../types";

// ============================================================================
// Audio Overview
// ============================================================================

export async function audio_overview_create(args: {
  notebook_id: string;
  source_ids?: string[];
  format?: "deep_dive" | "brief" | "critique" | "debate";
  length?: "short" | "default" | "long";
  language?: string;
  focus_prompt?: string;
  confirm?: boolean;
}): Promise<ToolResult> {
  if (!args.confirm) {
    return {
      status: "error",
      error: "Creation not confirmed. Set confirm=true after user approval.",
    };
  }

  try {
    const options: Record<string, unknown> = {};

    if (args.format) {
      const formatCodes: Record<string, number> = {
        deep_dive: 1, brief: 2, critique: 3, debate: 4,
      };
      options.format = formatCodes[args.format] || 1;
    }

    if (args.length) {
      const lengthCodes: Record<string, number> = {
        short: 1, default: 2, long: 3,
      };
      options.length = lengthCodes[args.length] || 2;
    }

    if (args.language) options.language = args.language;
    if (args.focus_prompt) options.focus_prompt = args.focus_prompt;

    const client = getClient();
    const artifactId = await client.createStudioContent(
      args.notebook_id,
      "audio",
      options,
      args.source_ids
    );

    return {
      status: "success",
      artifact_id: artifactId,
      message: "Audio overview generation started. Poll studio_status for progress.",
    };
  } catch (e) {
    return { status: "error", error: String(e) };
  }
}

// ============================================================================
// Video Overview
// ============================================================================

export async function video_overview_create(args: {
  notebook_id: string;
  source_ids?: string[];
  format?: "explainer" | "brief";
  visual_style?: string;
  language?: string;
  focus_prompt?: string;
  confirm?: boolean;
}): Promise<ToolResult> {
  if (!args.confirm) {
    return {
      status: "error",
      error: "Creation not confirmed. Set confirm=true after user approval.",
    };
  }

  try {
    const options: Record<string, unknown> = {};

    if (args.format) {
      options.format = args.format === "brief" ? 2 : 1;
    }

    if (args.visual_style) {
      const styleCodes: Record<string, number> = {
        auto_select: 1, classic: 2, whiteboard: 3, kawaii: 4,
        anime: 5, watercolor: 6, retro_print: 7, heritage: 8, paper_craft: 9,
      };
      options.visual_style = styleCodes[args.visual_style] || 1;
    }

    if (args.language) options.language = args.language;
    if (args.focus_prompt) options.focus_prompt = args.focus_prompt;

    const client = getClient();
    const artifactId = await client.createStudioContent(
      args.notebook_id,
      "video",
      options,
      args.source_ids
    );

    return {
      status: "success",
      artifact_id: artifactId,
      message: "Video overview generation started. Poll studio_status for progress.",
    };
  } catch (e) {
    return { status: "error", error: String(e) };
  }
}

// ============================================================================
// Infographic
// ============================================================================

export async function infographic_create(args: {
  notebook_id: string;
  source_ids?: string[];
  orientation?: "landscape" | "portrait" | "square";
  detail_level?: "concise" | "standard" | "detailed";
  language?: string;
  focus_prompt?: string;
  confirm?: boolean;
}): Promise<ToolResult> {
  if (!args.confirm) {
    return {
      status: "error",
      error: "Creation not confirmed. Set confirm=true after user approval.",
    };
  }

  try {
    const options: Record<string, unknown> = {};

    if (args.orientation) {
      const orientationCodes: Record<string, number> = {
        landscape: 1, portrait: 2, square: 3,
      };
      options.orientation = orientationCodes[args.orientation] || 1;
    }

    if (args.detail_level) {
      const detailCodes: Record<string, number> = {
        concise: 1, standard: 2, detailed: 3,
      };
      options.detail_level = detailCodes[args.detail_level] || 2;
    }

    if (args.language) options.language = args.language;
    if (args.focus_prompt) options.focus_prompt = args.focus_prompt;

    const client = getClient();
    const artifactId = await client.createStudioContent(
      args.notebook_id,
      "infographic",
      options,
      args.source_ids
    );

    return {
      status: "success",
      artifact_id: artifactId,
      message: "Infographic generation started. Poll studio_status for progress.",
    };
  } catch (e) {
    return { status: "error", error: String(e) };
  }
}

// ============================================================================
// Slide Deck
// ============================================================================

export async function slide_deck_create(args: {
  notebook_id: string;
  source_ids?: string[];
  format?: "detailed_deck" | "presenter_slides";
  length?: "short" | "default";
  language?: string;
  focus_prompt?: string;
  confirm?: boolean;
}): Promise<ToolResult> {
  if (!args.confirm) {
    return {
      status: "error",
      error: "Creation not confirmed. Set confirm=true after user approval.",
    };
  }

  try {
    const options: Record<string, unknown> = {};

    if (args.format) {
      options.format = args.format === "presenter_slides" ? 2 : 1;
    }

    if (args.length) {
      options.length = args.length === "short" ? 1 : 2;
    }

    if (args.language) options.language = args.language;
    if (args.focus_prompt) options.focus_prompt = args.focus_prompt;

    const client = getClient();
    const artifactId = await client.createStudioContent(
      args.notebook_id,
      "slide_deck",
      options,
      args.source_ids
    );

    return {
      status: "success",
      artifact_id: artifactId,
      message: "Slide deck generation started. Poll studio_status for progress.",
    };
  } catch (e) {
    return { status: "error", error: String(e) };
  }
}

// ============================================================================
// Report
// ============================================================================

export async function report_create(args: {
  notebook_id: string;
  source_ids?: string[];
  report_format?: "Briefing Doc" | "Study Guide" | "Blog Post" | "Create Your Own";
  custom_prompt?: string;
  language?: string;
  confirm?: boolean;
}): Promise<ToolResult> {
  if (!args.confirm) {
    return {
      status: "error",
      error: "Creation not confirmed. Set confirm=true after user approval.",
    };
  }

  try {
    const options: Record<string, unknown> = {};

    if (args.report_format) {
      const formatCodes: Record<string, number> = {
        "Briefing Doc": 1, "Study Guide": 2, "Blog Post": 3, "Create Your Own": 4,
      };
      options.report_format = formatCodes[args.report_format] || 1;

      if (args.report_format === "Create Your Own" && !args.custom_prompt) {
        return {
          status: "error",
          error: "custom_prompt is required for 'Create Your Own' format",
        };
      }
    }

    if (args.custom_prompt) options.custom_prompt = args.custom_prompt;
    if (args.language) options.language = args.language;

    const client = getClient();
    const artifactId = await client.createStudioContent(
      args.notebook_id,
      "report",
      options,
      args.source_ids
    );

    return {
      status: "success",
      artifact_id: artifactId,
      message: "Report generation started. Poll studio_status for progress.",
    };
  } catch (e) {
    return { status: "error", error: String(e) };
  }
}

// ============================================================================
// Flashcards
// ============================================================================

export async function flashcards_create(args: {
  notebook_id: string;
  source_ids?: string[];
  difficulty?: "easy" | "medium" | "hard";
  confirm?: boolean;
}): Promise<ToolResult> {
  if (!args.confirm) {
    return {
      status: "error",
      error: "Creation not confirmed. Set confirm=true after user approval.",
    };
  }

  try {
    const options: Record<string, unknown> = {};

    if (args.difficulty) {
      const difficultyCodes: Record<string, number> = {
        easy: 1, medium: 2, hard: 3,
      };
      options.difficulty = difficultyCodes[args.difficulty] || 2;
    }

    const client = getClient();
    const artifactId = await client.createStudioContent(
      args.notebook_id,
      "flashcards",
      options,
      args.source_ids
    );

    return {
      status: "success",
      artifact_id: artifactId,
      message: "Flashcards generation started. Poll studio_status for progress.",
    };
  } catch (e) {
    return { status: "error", error: String(e) };
  }
}

// ============================================================================
// Quiz
// ============================================================================

export async function quiz_create(args: {
  notebook_id: string;
  source_ids?: string[];
  question_count?: number;
  difficulty?: "easy" | "medium" | "hard";
  confirm?: boolean;
}): Promise<ToolResult> {
  if (!args.confirm) {
    return {
      status: "error",
      error: "Creation not confirmed. Set confirm=true after user approval.",
    };
  }

  try {
    const options: Record<string, unknown> = {
      question_count: args.question_count || 2,
    };

    if (args.difficulty) {
      const difficultyCodes: Record<string, number> = {
        easy: 1, medium: 2, hard: 3,
      };
      options.difficulty = difficultyCodes[args.difficulty] || 2;
    }

    const client = getClient();
    const artifactId = await client.createStudioContent(
      args.notebook_id,
      "quiz",
      options,
      args.source_ids
    );

    return {
      status: "success",
      artifact_id: artifactId,
      message: "Quiz generation started. Poll studio_status for progress.",
    };
  } catch (e) {
    return { status: "error", error: String(e) };
  }
}

// ============================================================================
// Data Table
// ============================================================================

export async function data_table_create(args: {
  notebook_id: string;
  description: string;
  source_ids?: string[];
  language?: string;
  confirm?: boolean;
}): Promise<ToolResult> {
  if (!args.confirm) {
    return {
      status: "error",
      error: "Creation not confirmed. Set confirm=true after user approval.",
    };
  }

  try {
    const options: Record<string, unknown> = {
      description: args.description,
    };

    if (args.language) options.language = args.language;

    const client = getClient();
    const artifactId = await client.createStudioContent(
      args.notebook_id,
      "data_table",
      options,
      args.source_ids
    );

    return {
      status: "success",
      artifact_id: artifactId,
      message: "Data table generation started. Poll studio_status for progress.",
    };
  } catch (e) {
    return { status: "error", error: String(e) };
  }
}

// ============================================================================
// Mind Map
// ============================================================================

export async function mind_map_create(args: {
  notebook_id: string;
  source_ids?: string[];
  title?: string;
  confirm?: boolean;
}): Promise<ToolResult> {
  if (!args.confirm) {
    return {
      status: "error",
      error: "Creation not confirmed. Set confirm=true after user approval.",
    };
  }

  try {
    const client = getClient();
    const result = await client.createMindMap(
      args.notebook_id,
      args.source_ids,
      args.title
    );

    return {
      status: "success",
      mind_map_id: result.id,
      content: result.content,
      message: "Mind map created successfully.",
    };
  } catch (e) {
    return { status: "error", error: String(e) };
  }
}

// ============================================================================
// Studio Status & Delete
// ============================================================================

export async function studio_status(args: {
  notebook_id: string;
}): Promise<ToolResult> {
  try {
    const client = getClient();
    const artifacts = await client.pollStudioStatus(args.notebook_id);

    return {
      status: "success",
      count: artifacts.length,
      artifacts: artifacts.map((a) => ({
        id: a.id,
        type: a.type,
        status: a.status,
        url: a.url,
        created_at: a.createdAt,
      })),
    };
  } catch (e) {
    return { status: "error", error: String(e) };
  }
}

export async function studio_delete(args: {
  notebook_id: string;
  artifact_id: string;
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
    const result = await client.deleteStudioArtifact(args.notebook_id, args.artifact_id);

    if (result) {
      return {
        status: "success",
        message: `Studio artifact ${args.artifact_id} has been permanently deleted.`,
      };
    }
    return { status: "error", error: "Failed to delete artifact" };
  } catch (e) {
    return { status: "error", error: String(e) };
  }
}

// Export tool metadata for OpenCode
export const studioToolsMetadata = {
  audio_overview_create: {
    description: "Generate audio overview. Requires confirm=true after user approval.",
    args: {
      notebook_id: { type: "string", required: true, description: "Notebook UUID" },
      source_ids: { type: "array", optional: true, description: "Source IDs (default: all)" },
      format: { type: "string", optional: true, description: "deep_dive|brief|critique|debate" },
      length: { type: "string", optional: true, description: "short|default|long" },
      language: { type: "string", optional: true, description: "BCP-47 code (en, es, fr, de, ja)" },
      focus_prompt: { type: "string", optional: true, description: "Optional focus text" },
      confirm: { type: "boolean", optional: true, description: "Must be true after user approval" },
    },
  },
  video_overview_create: {
    description: "Generate video overview. Requires confirm=true after user approval.",
    args: {
      notebook_id: { type: "string", required: true, description: "Notebook UUID" },
      source_ids: { type: "array", optional: true, description: "Source IDs (default: all)" },
      format: { type: "string", optional: true, description: "explainer|brief" },
      visual_style: { type: "string", optional: true, description: "auto_select|classic|whiteboard|kawaii|anime|watercolor|retro_print|heritage|paper_craft" },
      language: { type: "string", optional: true, description: "BCP-47 code" },
      focus_prompt: { type: "string", optional: true, description: "Optional focus text" },
      confirm: { type: "boolean", optional: true, description: "Must be true after user approval" },
    },
  },
  infographic_create: {
    description: "Generate infographic. Requires confirm=true after user approval.",
    args: {
      notebook_id: { type: "string", required: true, description: "Notebook UUID" },
      source_ids: { type: "array", optional: true, description: "Source IDs (default: all)" },
      orientation: { type: "string", optional: true, description: "landscape|portrait|square" },
      detail_level: { type: "string", optional: true, description: "concise|standard|detailed" },
      language: { type: "string", optional: true, description: "BCP-47 code" },
      focus_prompt: { type: "string", optional: true, description: "Optional focus text" },
      confirm: { type: "boolean", optional: true, description: "Must be true after user approval" },
    },
  },
  slide_deck_create: {
    description: "Generate slide deck. Requires confirm=true after user approval.",
    args: {
      notebook_id: { type: "string", required: true, description: "Notebook UUID" },
      source_ids: { type: "array", optional: true, description: "Source IDs (default: all)" },
      format: { type: "string", optional: true, description: "detailed_deck|presenter_slides" },
      length: { type: "string", optional: true, description: "short|default" },
      language: { type: "string", optional: true, description: "BCP-47 code" },
      focus_prompt: { type: "string", optional: true, description: "Optional focus text" },
      confirm: { type: "boolean", optional: true, description: "Must be true after user approval" },
    },
  },
  report_create: {
    description: "Generate report. Requires confirm=true after user approval.",
    args: {
      notebook_id: { type: "string", required: true, description: "Notebook UUID" },
      source_ids: { type: "array", optional: true, description: "Source IDs (default: all)" },
      report_format: { type: "string", optional: true, description: "Briefing Doc|Study Guide|Blog Post|Create Your Own" },
      custom_prompt: { type: "string", optional: true, description: "Required for 'Create Your Own'" },
      language: { type: "string", optional: true, description: "BCP-47 code" },
      confirm: { type: "boolean", optional: true, description: "Must be true after user approval" },
    },
  },
  flashcards_create: {
    description: "Generate flashcards. Requires confirm=true after user approval.",
    args: {
      notebook_id: { type: "string", required: true, description: "Notebook UUID" },
      source_ids: { type: "array", optional: true, description: "Source IDs (default: all)" },
      difficulty: { type: "string", optional: true, description: "easy|medium|hard" },
      confirm: { type: "boolean", optional: true, description: "Must be true after user approval" },
    },
  },
  quiz_create: {
    description: "Generate quiz. Requires confirm=true after user approval.",
    args: {
      notebook_id: { type: "string", required: true, description: "Notebook UUID" },
      source_ids: { type: "array", optional: true, description: "Source IDs (default: all)" },
      question_count: { type: "number", optional: true, description: "Number of questions (default: 2)" },
      difficulty: { type: "string", optional: true, description: "easy|medium|hard" },
      confirm: { type: "boolean", optional: true, description: "Must be true after user approval" },
    },
  },
  data_table_create: {
    description: "Generate data table. Requires confirm=true after user approval.",
    args: {
      notebook_id: { type: "string", required: true, description: "Notebook UUID" },
      description: { type: "string", required: true, description: "Description of the data table to create" },
      source_ids: { type: "array", optional: true, description: "Source IDs (default: all)" },
      language: { type: "string", optional: true, description: "Language code (default: en)" },
      confirm: { type: "boolean", optional: true, description: "Must be true after user approval" },
    },
  },
  mind_map_create: {
    description: "Generate and save mind map. Requires confirm=true after user approval.",
    args: {
      notebook_id: { type: "string", required: true, description: "Notebook UUID" },
      source_ids: { type: "array", optional: true, description: "Source IDs (default: all)" },
      title: { type: "string", optional: true, description: "Display title" },
      confirm: { type: "boolean", optional: true, description: "Must be true after user approval" },
    },
  },
  studio_status: {
    description: "Check studio content generation status and get URLs.",
    args: {
      notebook_id: { type: "string", required: true, description: "Notebook UUID" },
    },
  },
  studio_delete: {
    description: "Delete studio artifact. IRREVERSIBLE. Requires confirm=true.",
    args: {
      notebook_id: { type: "string", required: true, description: "Notebook UUID" },
      artifact_id: { type: "string", required: true, description: "Artifact UUID (from studio_status)" },
      confirm: { type: "boolean", optional: true, description: "Must be true after user approval" },
    },
  },
};
