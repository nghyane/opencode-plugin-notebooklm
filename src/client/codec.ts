/**
 * RPC Codec - parse and map RPC responses to typed DTOs
 */

import type {
  Notebook,
  Source,
  NotebookSummary,
  SourceGuide,
  SourceContent,
  ResearchTask,
  StudioArtifact,
  ConversationTurn,
} from "../types";
import { CONSTANTS } from "../types";
import { stripXssiPrefix } from "./encoding";

// ============================================================================
// Helper Functions
// ============================================================================

function parseTimestamp(tsArray: unknown): string | null {
  if (!Array.isArray(tsArray) || tsArray.length < 1) return null;
  const seconds = tsArray[0];
  if (typeof seconds !== "number") return null;
  try {
    return new Date(seconds * 1000).toISOString();
  } catch {
    return null;
  }
}

function extractAllText(data: unknown[]): string[] {
  const texts: string[] = [];
  for (const item of data) {
    if (typeof item === "string" && item.length > 0) {
      texts.push(item);
    } else if (Array.isArray(item)) {
      texts.push(...extractAllText(item));
    }
  }
  return texts;
}

function getSourceTypeName(code: number): string {
  const types: Record<number, string> = {
    1: "google_docs",
    2: "google_other",
    4: "pasted_text",
    5: "web",
  };
  return types[code] || "unknown";
}

function getResearchResultType(code: number): string {
  const types: Record<number, string> = {
    1: "web",
    2: "google_doc",
    3: "google_slides",
    4: "deep_report",
    5: "google_sheets",
  };
  return types[code] || "unknown";
}

function getStudioTypeName(code: number): StudioArtifact["type"] {
  const types: Record<number, StudioArtifact["type"]> = {
    1: "audio",
    2: "video",
    3: "report",
    4: "flashcards",
    5: "infographic",
    6: "slide_deck",
    8: "data_table",
  };
  return types[code] || "audio";
}

function getStudioStatus(code: number): StudioArtifact["status"] {
  const statuses: Record<number, StudioArtifact["status"]> = {
    0: "pending",
    1: "generating",
    2: "ready",
    3: "failed",
  };
  return statuses[code] || "pending";
}

// ============================================================================
// Decoders
// ============================================================================

/**
 * Decode list notebooks response
 */
export function decodeNotebooks(result: unknown): Notebook[] {
  const notebooks: Notebook[] = [];
  if (!result || !Array.isArray(result)) return notebooks;

  const notebookList = Array.isArray(result[0]) ? result[0] : result;

  for (const nbData of notebookList) {
    if (!Array.isArray(nbData) || nbData.length < 3) continue;

    const title = typeof nbData[0] === "string" ? nbData[0] : "Untitled";
    const sourcesData = nbData[1] || [];
    const notebookId = nbData[2];

    let isOwned = true;
    let isShared = false;
    let createdAt: string | null = null;
    let modifiedAt: string | null = null;

    if (nbData.length > 5 && Array.isArray(nbData[5])) {
      const metadata = nbData[5];
      isOwned = metadata[0] === CONSTANTS.OWNERSHIP_MINE;
      isShared = Boolean(metadata[1]);
      modifiedAt = parseTimestamp(metadata[5]);
      createdAt = parseTimestamp(metadata[8]);
    }

    const sources: Source[] = [];
    if (Array.isArray(sourcesData)) {
      for (const src of sourcesData) {
        if (Array.isArray(src) && src.length >= 2) {
          const srcIds = src[0] || [];
          const srcTitle = src[1] || "Untitled";
          const srcId = Array.isArray(srcIds) ? srcIds[0] : srcIds;
          sources.push({ id: srcId, title: srcTitle });
        }
      }
    }

    if (notebookId) {
      notebooks.push({
        id: notebookId,
        title,
        sourceCount: sources.length,
        sources,
        isOwned,
        isShared,
        createdAt,
        modifiedAt,
      });
    }
  }

  return notebooks;
}

/**
 * Decode single notebook response
 */
export function decodeNotebook(result: unknown): { title: string; sources: Source[] } | null {
  if (!result || !Array.isArray(result)) return null;

  const title = result[0] || "Untitled";
  const sourcesData = Array.isArray(result[1]) ? result[1] : [];
  
  const sources: Source[] = sourcesData.map((src: unknown[]) => ({
    id: Array.isArray(src[0]) ? src[0][0] : src[0],
    title: (typeof src[1] === "string" ? src[1] : null) || "Untitled",
  }));

  return { title, sources };
}

/**
 * Decode create notebook response
 */
export function decodeCreatedNotebook(result: unknown, title: string): Notebook | null {
  if (result && Array.isArray(result) && result.length >= 3) {
    const notebookId = result[2];
    if (notebookId) {
      return {
        id: notebookId,
        title: title || "Untitled notebook",
        sourceCount: 0,
        sources: [],
        isOwned: true,
        isShared: false,
        createdAt: null,
        modifiedAt: null,
      };
    }
  }
  return null;
}

/**
 * Decode notebook summary response
 */
export function decodeNotebookSummary(result: unknown): NotebookSummary {
  let summary = "";
  const suggestedTopics: { question: string; prompt: string }[] = [];

  if (result && Array.isArray(result)) {
    if (result[0]?.[0]) {
      summary = result[0][0];
    }

    if (result[1]?.[0]) {
      for (const topic of result[1][0]) {
        if (Array.isArray(topic) && topic.length >= 2) {
          suggestedTopics.push({
            question: topic[0],
            prompt: topic[1],
          });
        }
      }
    }
  }

  return { summary, suggestedTopics };
}

/**
 * Decode add source response
 */
export function decodeSource(result: unknown): Source | null {
  if (result && Array.isArray(result) && result[0]) {
    const sourceData = result[0];
    const sourceId = sourceData[0]?.[0];
    const title = sourceData[1] || "Untitled";
    if (sourceId) {
      return { id: sourceId, title };
    }
  }
  return null;
}

/**
 * Decode source guide response
 */
export function decodeSourceGuide(result: unknown): SourceGuide {
  let summary = "";
  let keywords: string[] = [];

  if (result && Array.isArray(result)) {
    const inner = result[0]?.[0];
    if (inner) {
      summary = inner[1]?.[0] || "";
      keywords = inner[2]?.[0] || [];
    }
  }

  return { summary, keywords };
}

/**
 * Decode source content response
 */
export function decodeSourceContent(result: unknown): SourceContent {
  let content = "";
  let title = "";
  let sourceType = "";
  let url: string | null = null;

  if (result && Array.isArray(result)) {
    const sourceMeta = result[0];
    if (sourceMeta) {
      title = sourceMeta[1] || "";
      const metadata = sourceMeta[2] || [];
      if (metadata[4] !== undefined) {
        sourceType = getSourceTypeName(metadata[4]);
      }
      if (metadata[7]?.[0]) {
        url = metadata[7][0];
      }
    }

    if (result[3]?.[0]) {
      const textParts = extractAllText(result[3][0]);
      content = textParts.join("\n\n");
    }
  }

  return {
    content,
    title,
    sourceType,
    url,
    charCount: content.length,
  };
}

/**
 * Decode research status response
 */
export function decodeResearchTask(result: unknown, taskId: string, notebookId: string): ResearchTask {
  let status: ResearchTask["status"] = "pending";
  const sources: ResearchTask["sources"] = [];
  let report = "";

  if (result && Array.isArray(result)) {
    const statusCode = result[0];
    if (statusCode === 2) status = "completed";
    else if (statusCode === 1) status = "running";
    else if (statusCode === 3) status = "failed";

    if (result[1] && Array.isArray(result[1])) {
      let index = 0;
      for (const src of result[1]) {
        if (Array.isArray(src)) {
          sources.push({
            index: index++,
            title: src[0] || "",
            url: src[1] || undefined,
            type: getResearchResultType(src[2]),
          });
        }
      }
    }

    if (result[2]) {
      report = result[2];
    }
  }

  return {
    taskId,
    notebookId,
    status,
    sources,
    report: report || undefined,
  };
}

/**
 * Decode studio artifacts response
 */
export function decodeStudioArtifacts(result: unknown): StudioArtifact[] {
  const artifacts: StudioArtifact[] = [];

  if (result && Array.isArray(result)) {
    for (const item of result) {
      if (Array.isArray(item)) {
        artifacts.push({
          id: item[0] || "",
          type: getStudioTypeName(item[1]),
          status: getStudioStatus(item[2]),
          url: item[3] || undefined,
          createdAt: parseTimestamp(item[4]) || "",
        });
      }
    }
  }

  return artifacts;
}

/**
 * Decode streaming query response
 */
export function decodeQueryResponse(text: string): { answer: string; conversationId: string | null } {
  const responseText = stripXssiPrefix(text);
  const lines = responseText.trim().split("\n");

  let longestAnswer = "";
  let longestThinking = "";
  let conversationId: string | null = null;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i]?.trim() ?? '';
    if (!line) {
      i++;
      continue;
    }

    const byteCount = parseInt(line, 10);
    if (!isNaN(byteCount) && byteCount > 0) {
      i++;
      if (i < lines.length) {
        const { text: extractedText, isAnswer, error } = extractAnswerFromChunk(lines[i] ?? '');
        if (error) throw new Error(error);
        if (extractedText) {
          if (isAnswer && extractedText.length > longestAnswer.length) {
            longestAnswer = extractedText;
          } else if (!isAnswer && extractedText.length > longestThinking.length) {
            longestThinking = extractedText;
          }
        }
      }
      i++;
    } else {
      const { text: extractedText, isAnswer, error } = extractAnswerFromChunk(line);
      if (error) throw new Error(error);
      if (extractedText) {
        if (isAnswer && extractedText.length > longestAnswer.length) {
          longestAnswer = extractedText;
        } else if (!isAnswer && extractedText.length > longestThinking.length) {
          longestThinking = extractedText;
        }
      }
      i++;
    }
  }

  return {
    answer: longestAnswer || longestThinking,
    conversationId,
  };
}

/**
 * Helper to extract answer from a JSON chunk
 */
function extractAnswerFromChunk(jsonStr: string): { text: string | null; isAnswer: boolean; error?: string } {
  try {
    const data = JSON.parse(jsonStr);
    if (!Array.isArray(data) || data.length === 0) {
      return { text: null, isAnswer: false };
    }

    for (const item of data) {
      if (!Array.isArray(item) || item.length < 3) continue;
      if (item[0] !== "wrb.fr") continue;

      // Check for error signature
      if (item.length > 6 && item[6] === "generic") {
        if (Array.isArray(item[5]) && item[5].includes(16)) {
          return { text: null, isAnswer: false, error: "Authentication expired (RPC Error 16). Please run 'save_auth_tokens'." };
        }
        return { text: null, isAnswer: false, error: "Generic RPC Error from NotebookLM." };
      }

      const innerJsonStr = item[2];
      if (typeof innerJsonStr !== "string") continue;

      try {
        const innerData = JSON.parse(innerJsonStr);

        if (Array.isArray(innerData) && innerData.length > 0) {
          const firstElem = innerData[0];
          if (Array.isArray(firstElem) && firstElem.length > 0) {
            const answerText = firstElem[0];
            if (typeof answerText === "string" && answerText.length > 20) {
              let isAnswer = false;
              if (firstElem.length > 4 && Array.isArray(firstElem[4])) {
                const typeInfo = firstElem[4];
                const lastType = typeInfo[typeInfo.length - 1];
                if (typeof lastType === "number") {
                  isAnswer = lastType === 1;
                }
              }
              return { text: answerText, isAnswer };
            }
          } else if (typeof firstElem === "string" && firstElem.length > 20) {
            return { text: firstElem, isAnswer: false };
          }
        }
      } catch {
        continue;
      }
    }
  } catch {
    // Skip non-JSON lines
  }

  return { text: null, isAnswer: false };
}

/**
 * Extract source IDs from notebook data
 */
export function extractSourceIds(notebookData: unknown): string[] {
  if (!Array.isArray(notebookData)) return [];
  
  const data = Array.isArray(notebookData[0]) ? notebookData[0] : notebookData;
  
  if (!Array.isArray(data) || data.length < 2 || !Array.isArray(data[1])) {
    return [];
  }
  
  return data[1]
    .map((s: unknown) => {
      if (!Array.isArray(s) || s.length < 1) return null;
      const idData = s[0];
      if (Array.isArray(idData) && idData.length > 0) return idData[0];
      if (typeof idData === "string") return idData;
      return null;
    })
    .filter((id: unknown): id is string => typeof id === "string" && id.length > 0);
}
