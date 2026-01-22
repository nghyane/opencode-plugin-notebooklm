/**
 * Tools Index
 * 
 * Export all tools and metadata
 */

// Notebook tools
export {
  notebook_list,
  notebook_create,
  notebook_get,
  notebook_describe,
  notebook_query,
  notebook_delete,
  notebook_rename,
  notebook_add_url,
  notebook_add_text,
  notebook_add_drive,
  chat_configure,
  notebookToolsMetadata,
} from "./notebook";

// Source tools
export {
  source_describe,
  source_get_content,
  source_list_drive,
  source_sync_drive,
  source_delete,
  sourceToolsMetadata,
} from "./source";

// Research tools
export {
  research_start,
  research_status,
  research_import,
  researchToolsMetadata,
} from "./research";

// Studio tools
export {
  audio_overview_create,
  video_overview_create,
  infographic_create,
  slide_deck_create,
  report_create,
  flashcards_create,
  quiz_create,
  data_table_create,
  mind_map_create,
  studio_status,
  studio_delete,
  studioToolsMetadata,
} from "./studio";

// Auth tools
export {
  refresh_auth,
  save_auth_tokens,
  authToolsMetadata,
} from "./auth";

// Combined metadata
export const allToolsMetadata = {
  // Notebook (11 tools)
  notebook_list: { description: "List all notebooks", category: "notebook" },
  notebook_create: { description: "Create a new notebook", category: "notebook" },
  notebook_get: { description: "Get notebook details with sources", category: "notebook" },
  notebook_describe: { description: "Get AI-generated notebook summary", category: "notebook" },
  notebook_query: { description: "Ask AI about sources in notebook", category: "notebook" },
  notebook_delete: { description: "Delete notebook permanently", category: "notebook" },
  notebook_rename: { description: "Rename a notebook", category: "notebook" },
  notebook_add_url: { description: "Add URL as source", category: "notebook" },
  notebook_add_text: { description: "Add text as source", category: "notebook" },
  notebook_add_drive: { description: "Add Drive document as source", category: "notebook" },
  chat_configure: { description: "Configure chat settings", category: "notebook" },

  // Source (5 tools)
  source_describe: { description: "Get AI-generated source summary", category: "source" },
  source_get_content: { description: "Get raw text content of source", category: "source" },
  source_list_drive: { description: "List sources with Drive freshness", category: "source" },
  source_sync_drive: { description: "Sync Drive sources", category: "source" },
  source_delete: { description: "Delete source permanently", category: "source" },

  // Research (3 tools)
  research_start: { description: "Start deep/fast research", category: "research" },
  research_status: { description: "Poll research progress", category: "research" },
  research_import: { description: "Import discovered sources", category: "research" },

  // Studio (11 tools)
  audio_overview_create: { description: "Generate audio overview", category: "studio" },
  video_overview_create: { description: "Generate video overview", category: "studio" },
  infographic_create: { description: "Generate infographic", category: "studio" },
  slide_deck_create: { description: "Generate slide deck", category: "studio" },
  report_create: { description: "Generate report", category: "studio" },
  flashcards_create: { description: "Generate flashcards", category: "studio" },
  quiz_create: { description: "Generate quiz", category: "studio" },
  data_table_create: { description: "Generate data table", category: "studio" },
  mind_map_create: { description: "Generate mind map", category: "studio" },
  studio_status: { description: "Check studio generation status", category: "studio" },
  studio_delete: { description: "Delete studio artifact", category: "studio" },

  // Auth (2 tools)
  refresh_auth: { description: "Reload auth tokens", category: "auth" },
  save_auth_tokens: { description: "Save auth tokens manually", category: "auth" },
};
