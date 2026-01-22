/**
 * Data Normalizers
 * 
 * Chuẩn hóa response data để:
 * - Consistent structure across all tools
 * - Remove redundant/duplicate fields
 * - Flatten unnecessary nesting
 * - Keep essential data, không truncate
 */

import type { Notebook, Source, StudioArtifact } from "../types";

// ============================================================================
// Normalized Types (flat, minimal, consistent)
// ============================================================================

export interface NormalizedNotebook {
  id: string;
  title: string;
  sourceCount: number;
  url: string;
  owned: boolean;
}

export interface NormalizedSource {
  id: string;
  title: string;
  type: string;
  url?: string;
}

export interface NormalizedStudioArtifact {
  id: string;
  type: string;
  status: string;
  url?: string;
}

// ============================================================================
// Notebook Normalizer
// ============================================================================

export function normalizeNotebook(nb: Notebook): NormalizedNotebook {
  return {
    id: nb.id,
    title: nb.title,
    sourceCount: nb.sourceCount,
    url: `https://notebooklm.google.com/notebook/${nb.id}`,
    owned: nb.isOwned,
  };
}

export function normalizeNotebooks(notebooks: Notebook[]): NormalizedNotebook[] {
  return notebooks.map(normalizeNotebook);
}

// ============================================================================
// Source Normalizer
// ============================================================================

export function normalizeSource(src: Source): NormalizedSource {
  return {
    id: src.id,
    title: src.title,
    type: src.type || "unknown",
    ...(src.url && { url: src.url }),
  };
}

// ============================================================================
// Raw API Response Normalizer
// ============================================================================

/**
 * Normalize raw notebook response from API
 * Input: nested array structure from batchexecute
 * Output: flat, consistent structure
 */
export function normalizeRawNotebook(raw: unknown[]): {
  id: string;
  title: string;
  sources: NormalizedSource[];
} | null {
  if (!Array.isArray(raw) || raw.length < 3) return null;

  const title = typeof raw[0] === "string" ? raw[0] : "Untitled";
  const sourcesData = Array.isArray(raw[1]) ? raw[1] : [];
  const id = typeof raw[2] === "string" ? raw[2] : "";

  const sources: NormalizedSource[] = [];
  for (const src of sourcesData) {
    if (!Array.isArray(src) || src.length < 2) continue;
    
    const srcIds = src[0];
    const srcId = Array.isArray(srcIds) ? srcIds[0] : srcIds;
    const srcTitle = src[1] || "Untitled";
    const metadata = Array.isArray(src[2]) ? src[2] : [];
    const srcType = getSourceTypeName(metadata[4]);

    if (srcId) {
      sources.push({
        id: srcId,
        title: srcTitle,
        type: srcType,
      });
    }
  }

  return { id, title, sources };
}

/**
 * Normalize raw source content response
 */
export function normalizeRawSourceContent(raw: unknown[]): {
  title: string;
  type: string;
  url: string | null;
  content: string;
  charCount: number;
} | null {
  if (!Array.isArray(raw)) return null;

  const sourceMeta = raw[0] as unknown[] | undefined;
  const title = (sourceMeta?.[1] as string) || "";
  const metadata = (sourceMeta?.[2] as unknown[]) || [];
  const type = getSourceTypeName(metadata[4] as number | undefined);
  const url = ((metadata[7] as unknown[])?.[0] as string) || null;

  // Extract content from nested structure
  const contentParts: string[] = [];
  const contentData = (raw[3] as unknown[])?.[0];
  if (contentData) {
    extractText(contentData, contentParts);
  }
  const content = contentParts.join("\n\n");

  return {
    title,
    type,
    url,
    content,
    charCount: content.length,
  };
}

/**
 * Normalize studio artifacts
 */
export function normalizeStudioArtifact(artifact: StudioArtifact): NormalizedStudioArtifact {
  return {
    id: artifact.id,
    type: artifact.type,
    status: artifact.status,
    ...(artifact.url && { url: artifact.url }),
  };
}

// ============================================================================
// Helpers
// ============================================================================

function getSourceTypeName(code: number | undefined): string {
  const types: Record<number, string> = {
    1: "google_docs",
    2: "google_drive",
    4: "text",
    5: "web",
  };
  return types[code as number] || "unknown";
}

function extractText(data: unknown, output: string[]): void {
  if (typeof data === "string" && data.length > 0) {
    output.push(data);
  } else if (Array.isArray(data)) {
    for (const item of data) {
      extractText(item, output);
    }
  }
}

// ============================================================================
// Response Builders (consistent output format)
// ============================================================================

export interface ToolResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  cached?: boolean;
}

export function success<T>(data: T, cached = false): ToolResponse<T> {
  return { ok: true, data, ...(cached && { cached }) };
}

export function failure(error: string): ToolResponse<never> {
  return { ok: false, error };
}
