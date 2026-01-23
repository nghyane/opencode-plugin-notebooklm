/**
 * TypeScript types for NotebookLM OpenCode Plugin
 */

// ============================================================================
// Auth Types
// ============================================================================

export interface AuthTokens {
  cookies: Record<string, string>;
  csrfToken: string;
  sessionId: string;
  extractedAt: number;
}

export const REQUIRED_COOKIES = ["SID", "HSID", "SSID", "APISID", "SAPISID"] as const;

// ============================================================================
// Notebook Types
// ============================================================================

export interface Notebook {
  id: string;
  title: string;
  sourceCount: number;
  sources: Source[];
  isOwned: boolean;
  isShared: boolean;
  createdAt: string | null;
  modifiedAt: string | null;
}

export interface Source {
  id: string;
  title: string;
  type?: string | undefined;
  url?: string | undefined;
}

export interface NotebookSummary {
  summary: string;
  suggestedTopics: SuggestedTopic[];
}

export interface SuggestedTopic {
  question: string;
  prompt: string;
}

export interface SourceGuide {
  summary: string;
  keywords: string[];
}

export interface SourceContent {
  content: string;
  title: string;
  sourceType: string;
  url: string | null;
  charCount: number;
}

// ============================================================================
// Query Types
// ============================================================================

export interface QueryResult {
  answer: string;
  conversationId: string | null;
}

export interface ConversationTurn {
  query: string;
  answer: string;
  turnNumber: number;
}

// ============================================================================
// Research Types
// ============================================================================

export type ResearchSource = "web" | "drive";
export type ResearchMode = "fast" | "deep";

export interface ResearchTask {
  taskId: string;
  notebookId: string;
  status: "pending" | "running" | "completed" | "failed";
  sources: DiscoveredSource[];
  report?: string | undefined;
}

export interface DiscoveredSource {
  index: number;
  title: string;
  url?: string | undefined;
  type: string;
}

// ============================================================================
// Studio Types (Audio/Video/Infographic/etc)
// ============================================================================

export type StudioType = "audio" | "video" | "infographic" | "slide_deck" | "report" | "flashcards" | "quiz" | "data_table" | "mind_map";

export type AudioFormat = "deep_dive" | "brief" | "critique" | "debate";
export type AudioLength = "short" | "default" | "long";
export type VideoFormat = "explainer" | "brief";
export type VideoStyle = "auto_select" | "classic" | "whiteboard" | "kawaii" | "anime" | "watercolor" | "retro_print" | "heritage" | "paper_craft";
export type InfographicOrientation = "landscape" | "portrait" | "square";
export type InfographicDetail = "concise" | "standard" | "detailed";
export type SlideDeckFormat = "detailed_deck" | "presenter_slides";
export type SlideDeckLength = "short" | "default";
export type ReportFormat = "Briefing Doc" | "Study Guide" | "Blog Post" | "Create Your Own";
export type FlashcardDifficulty = "easy" | "medium" | "hard";

export interface StudioArtifact {
  id: string;
  type: StudioType;
  status: "pending" | "generating" | "ready" | "failed";
  url?: string | undefined;
  createdAt: string;
}

// ============================================================================
// Chat Configuration
// ============================================================================

export type ChatGoal = "default" | "learning_guide" | "custom";
export type ResponseLength = "default" | "longer" | "shorter";

export interface ChatConfig {
  goal: ChatGoal;
  customPrompt?: string | undefined;
  responseLength: ResponseLength;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface ToolResult<T = unknown> {
  status: "success" | "error" | "timeout";
  error?: string | undefined;
  message?: string | undefined;
  [key: string]: unknown;
}

// ============================================================================
// Constants
// ============================================================================

export const CONSTANTS = {
  // Ownership
  OWNERSHIP_MINE: 1,
  OWNERSHIP_SHARED: 2,

  // Source types
  SOURCE_TYPE_GOOGLE_DOCS: 1,
  SOURCE_TYPE_GOOGLE_OTHER: 2,
  SOURCE_TYPE_PASTED_TEXT: 4,
  SOURCE_TYPE_WEB: 5,

  // Research
  RESEARCH_SOURCE_WEB: 1,
  RESEARCH_SOURCE_DRIVE: 2,
  RESEARCH_MODE_FAST: 1,
  RESEARCH_MODE_DEEP: 2,

  // Studio types (matching reference implementation)
  STUDIO_TYPE_AUDIO: 1,
  STUDIO_TYPE_VIDEO: 3,         // Was 2, reference says 3
  STUDIO_TYPE_INFOGRAPHIC: 7,   // Was 5, reference says 7
  STUDIO_TYPE_SLIDE_DECK: 8,    // Was 6, reference says 8
  STUDIO_TYPE_REPORT: 2,        // Was 3, reference says 2
  STUDIO_TYPE_FLASHCARDS: 4,
  STUDIO_TYPE_DATA_TABLE: 9,    // Was 8, reference says 9

  // Audio formats
  AUDIO_FORMAT_DEEP_DIVE: 1,
  AUDIO_FORMAT_BRIEF: 2,
  AUDIO_FORMAT_CRITIQUE: 3,
  AUDIO_FORMAT_DEBATE: 4,

  // Audio lengths
  AUDIO_LENGTH_SHORT: 1,
  AUDIO_LENGTH_DEFAULT: 2,
  AUDIO_LENGTH_LONG: 3,

  // Video formats
  VIDEO_FORMAT_EXPLAINER: 1,
  VIDEO_FORMAT_BRIEF: 2,

  // Video styles
  VIDEO_STYLE_AUTO_SELECT: 1,
  VIDEO_STYLE_CLASSIC: 2,
  VIDEO_STYLE_WHITEBOARD: 3,
  VIDEO_STYLE_KAWAII: 4,
  VIDEO_STYLE_ANIME: 5,
  VIDEO_STYLE_WATERCOLOR: 6,
  VIDEO_STYLE_RETRO_PRINT: 7,
  VIDEO_STYLE_HERITAGE: 8,
  VIDEO_STYLE_PAPER_CRAFT: 9,

  // Infographic
  INFOGRAPHIC_ORIENTATION_LANDSCAPE: 1,
  INFOGRAPHIC_ORIENTATION_PORTRAIT: 2,
  INFOGRAPHIC_ORIENTATION_SQUARE: 3,
  INFOGRAPHIC_DETAIL_CONCISE: 1,
  INFOGRAPHIC_DETAIL_STANDARD: 2,
  INFOGRAPHIC_DETAIL_DETAILED: 3,

  // Slide deck
  SLIDE_DECK_FORMAT_DETAILED: 1,
  SLIDE_DECK_FORMAT_PRESENTER: 2,
  SLIDE_DECK_LENGTH_SHORT: 1,
  SLIDE_DECK_LENGTH_DEFAULT: 2,

  // Report formats
  REPORT_FORMAT_BRIEFING_DOC: 1,
  REPORT_FORMAT_STUDY_GUIDE: 2,
  REPORT_FORMAT_BLOG_POST: 3,
  REPORT_FORMAT_CUSTOM: 4,

  // Flashcard difficulty
  FLASHCARD_DIFFICULTY_EASY: 1,
  FLASHCARD_DIFFICULTY_MEDIUM: 2,
  FLASHCARD_DIFFICULTY_HARD: 3,

  // Chat goals
  CHAT_GOAL_DEFAULT: 1,
  CHAT_GOAL_LEARNING_GUIDE: 2,
  CHAT_GOAL_CUSTOM: 3,

  // Response lengths
  CHAT_RESPONSE_DEFAULT: 2,
  CHAT_RESPONSE_LONGER: 3,
  CHAT_RESPONSE_SHORTER: 1,

  // Timeouts (ms)
  DEFAULT_TIMEOUT: 30000,
  SOURCE_ADD_TIMEOUT: 120000,
  QUERY_TIMEOUT: 120000,
} as const;

// RPC IDs
export const RPC_IDS = {
  LIST_NOTEBOOKS: "wXbhsf",
  GET_NOTEBOOK: "rLM1Ne",
  CREATE_NOTEBOOK: "CCqFvf",
  RENAME_NOTEBOOK: "s0tc2d",
  DELETE_NOTEBOOK: "WWINqb",
  ADD_SOURCE: "izAoDd",
  GET_SOURCE: "hizoJc",
  CHECK_FRESHNESS: "yR9Yof",
  SYNC_DRIVE: "FLmJqe",
  DELETE_SOURCE: "tGMBJ",
  GET_SUMMARY: "VfAZjd",
  GET_SOURCE_GUIDE: "tr032e",
  START_FAST_RESEARCH: "Ljjv0c",
  START_DEEP_RESEARCH: "QA9ei",
  POLL_RESEARCH: "e3bVqc",
  IMPORT_RESEARCH: "LBwxtb",
  CREATE_STUDIO: "R7cb6c",
  POLL_STUDIO: "gArtLc",
  DELETE_STUDIO: "V5N4be",
  GENERATE_MIND_MAP: "yyryJe",
  SAVE_MIND_MAP: "CYK0Xb",
  LIST_MIND_MAPS: "cFji9",
  DELETE_MIND_MAP: "AH0mwd",
} as const;
