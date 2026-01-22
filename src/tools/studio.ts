/**
 * Studio Tools v2
 * 
 * Unified studio_create(type, options) replaces 9 separate tools
 * studio_status is handled by hooks (auto-poll)
 */

import { getClient } from "../client/api";
import type { ToolResult } from "../types";

// ============================================================================
// Studio Type Options
// ============================================================================

type StudioType = 
  | "audio" 
  | "video" 
  | "infographic" 
  | "slide_deck" 
  | "report" 
  | "flashcards" 
  | "quiz" 
  | "data_table" 
  | "mind_map";

interface StudioOptions {
  // Common
  source_ids?: string[];
  language?: string;
  focus_prompt?: string;

  // Audio
  audio_format?: "deep_dive" | "brief" | "critique" | "debate";
  audio_length?: "short" | "default" | "long";

  // Video
  video_format?: "explainer" | "brief";
  video_style?: "auto_select" | "classic" | "whiteboard" | "kawaii" | "anime" | "watercolor" | "retro_print" | "heritage" | "paper_craft";

  // Infographic
  orientation?: "landscape" | "portrait" | "square";
  detail_level?: "concise" | "standard" | "detailed";

  // Slide deck
  slide_format?: "detailed_deck" | "presenter_slides";
  slide_length?: "short" | "default";

  // Report
  report_format?: "Briefing Doc" | "Study Guide" | "Blog Post" | "Create Your Own";
  custom_prompt?: string;

  // Flashcards/Quiz
  difficulty?: "easy" | "medium" | "hard";
  question_count?: number;

  // Data table
  description?: string;

  // Mind map
  title?: string;
}

// ============================================================================
// studio_create (unified)
// ============================================================================

export async function studio_create(args: {
  notebook_id: string;
  type: StudioType;
  options?: StudioOptions;
  confirm?: boolean;
}): Promise<ToolResult> {
  if (!args.confirm) {
    return {
      status: "error",
      error: "Creation not confirmed. Set confirm=true after user approval.",
    };
  }

  const opts = args.options || {};

  try {
    const client = getClient();

    // Handle mind_map separately (different API)
    if (args.type === "mind_map") {
      const result = await client.createMindMap(
        args.notebook_id,
        opts.source_ids,
        opts.title
      );
      return {
        status: "success",
        type: "mind_map",
        mind_map_id: result.id,
        message: "Mind map created.",
      };
    }

    // Build options for other types
    const studioOpts: Record<string, unknown> = {};

    // Common options
    if (opts.language) studioOpts.language = opts.language;
    if (opts.focus_prompt) studioOpts.focus_prompt = opts.focus_prompt;

    // Type-specific options
    switch (args.type) {
      case "audio":
        if (opts.audio_format) {
          const formatCodes = { deep_dive: 1, brief: 2, critique: 3, debate: 4 };
          studioOpts.format = formatCodes[opts.audio_format];
        }
        if (opts.audio_length) {
          const lengthCodes = { short: 1, default: 2, long: 3 };
          studioOpts.length = lengthCodes[opts.audio_length];
        }
        break;

      case "video":
        if (opts.video_format) {
          studioOpts.format = opts.video_format === "brief" ? 2 : 1;
        }
        if (opts.video_style) {
          const styleCodes: Record<string, number> = {
            auto_select: 1, classic: 2, whiteboard: 3, kawaii: 4,
            anime: 5, watercolor: 6, retro_print: 7, heritage: 8, paper_craft: 9,
          };
          studioOpts.visual_style = styleCodes[opts.video_style];
        }
        break;

      case "infographic":
        if (opts.orientation) {
          const orientCodes = { landscape: 1, portrait: 2, square: 3 };
          studioOpts.orientation = orientCodes[opts.orientation];
        }
        if (opts.detail_level) {
          const detailCodes = { concise: 1, standard: 2, detailed: 3 };
          studioOpts.detail_level = detailCodes[opts.detail_level];
        }
        break;

      case "slide_deck":
        if (opts.slide_format) {
          studioOpts.format = opts.slide_format === "presenter_slides" ? 2 : 1;
        }
        if (opts.slide_length) {
          studioOpts.length = opts.slide_length === "short" ? 1 : 2;
        }
        break;

      case "report":
        if (opts.report_format) {
          const formatCodes: Record<string, number> = {
            "Briefing Doc": 1, "Study Guide": 2, "Blog Post": 3, "Create Your Own": 4,
          };
          studioOpts.report_format = formatCodes[opts.report_format];
          if (opts.report_format === "Create Your Own" && !opts.custom_prompt) {
            return { status: "error", error: "custom_prompt required for Create Your Own" };
          }
        }
        if (opts.custom_prompt) studioOpts.custom_prompt = opts.custom_prompt;
        break;

      case "flashcards":
      case "quiz":
        if (opts.difficulty) {
          const diffCodes = { easy: 1, medium: 2, hard: 3 };
          studioOpts.difficulty = diffCodes[opts.difficulty];
        }
        if (args.type === "quiz" && opts.question_count) {
          studioOpts.question_count = opts.question_count;
        }
        break;

      case "data_table":
        if (!opts.description) {
          return { status: "error", error: "description required for data_table" };
        }
        studioOpts.description = opts.description;
        break;
    }

    const artifactId = await client.createStudioContent(
      args.notebook_id,
      args.type,
      studioOpts,
      opts.source_ids
    );

    return {
      status: "success",
      type: args.type,
      artifact_id: artifactId,
      message: `${args.type} generation started. Will be auto-monitored - URL provided when ready.`,
      _note: "No need to poll - plugin auto-monitors studio tasks.",
    };
  } catch (e) {
    return { status: "error", error: String(e) };
  }
}

// ============================================================================
// studio_delete
// ============================================================================

export async function studio_delete(args: {
  notebook_id: string;
  artifact_id: string;
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
    await client.deleteStudioArtifact(args.notebook_id, args.artifact_id);
    return { status: "success", message: "Studio artifact deleted." };
  } catch (e) {
    return { status: "error", error: String(e) };
  }
}

// ============================================================================
// Note: studio_status is now a hook
// - session.idle hook auto-polls pending studio tasks
// - User is notified via console.log when artifacts are ready
// ============================================================================
