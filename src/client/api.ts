/**
 * NotebookLM API Client
 * 
 * Ported from Python notebooklm-mcp to TypeScript for OpenCode plugin
 */

import type {
  AuthTokens,
  Notebook,
  Source,
  NotebookSummary,
  SourceGuide,
  SourceContent,
  QueryResult,
  ConversationTurn,
  ResearchTask,
  StudioArtifact,
  ChatConfig,
  ToolResult,
} from "../types";
import { CONSTANTS, RPC_IDS } from "../types";
import {
  loadCachedTokens,
  saveTokensToCache,
  cookiesToHeader,
  extractCsrfFromHtml,
  extractSessionIdFromHtml,
} from "../auth/tokens";
import { fetchWithRecovery, type StructuredError } from "./recovery";

const BASE_URL = "https://notebooklm.google.com";
const BATCHEXECUTE_URL = `${BASE_URL}/_/LabsTailwindUi/data/batchexecute`;
const QUERY_ENDPOINT = "/_/LabsTailwindUi/data/google.internal.labs.tailwind.orchestration.v1.LabsTailwindOrchestrationService/GenerateFreeFormStreamed";

// Browser-like headers for page fetch
const PAGE_FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
};

export class NotebookLMClient {
  private cookies: Record<string, string>;
  private csrfToken: string;
  private sessionId: string;
  private conversationCache: Map<string, ConversationTurn[]> = new Map();
  private reqidCounter: number;
  private authRefreshPromise: Promise<boolean> | null = null;

  constructor(cookies: Record<string, string>, csrfToken = "", sessionId = "") {
    this.cookies = cookies;
    this.csrfToken = csrfToken;
    this.sessionId = sessionId;
    this.reqidCounter = Math.floor(Math.random() * 900000) + 100000;

    // Schedule CSRF refresh if not provided (will be awaited on first RPC call)
    if (!this.csrfToken) {
      this.authRefreshPromise = this.refreshAuthTokens();
    }
  }

  /**
   * Ensure auth is ready before making API calls
   */
  private async ensureAuth(): Promise<void> {
    if (this.authRefreshPromise) {
      await this.authRefreshPromise;
      this.authRefreshPromise = null;
    }
  }

  /**
   * Refresh CSRF token and session ID by fetching NotebookLM homepage
   * Returns true if refresh succeeded, false otherwise
   */
  private async refreshAuthTokens(): Promise<boolean> {
    try {
      const cookieHeader = cookiesToHeader(this.cookies);

      const response = await fetch(BASE_URL + "/", {
        headers: {
          ...PAGE_FETCH_HEADERS,
          Cookie: cookieHeader,
        },
        redirect: "follow",
      });

      const finalUrl = response.url;
      if (finalUrl.includes("accounts.google.com")) {
        return false;
      }

      if (!response.ok) {
        return false;
      }

      const html = await response.text();

      const csrf = extractCsrfFromHtml(html);
      if (!csrf) {
        return false;
      }
      this.csrfToken = csrf;

      const sid = extractSessionIdFromHtml(html);
      if (sid) {
        this.sessionId = sid;
      }

      // Update cache
      this.updateCachedTokens();
      return true;
    } catch {
      return false;
    }
  }

  private updateCachedTokens(): void {
    try {
      const cached = loadCachedTokens();
      const tokens: AuthTokens = {
        cookies: this.cookies,
        csrfToken: this.csrfToken,
        sessionId: this.sessionId,
        extractedAt: cached?.extractedAt || Date.now() / 1000,
      };
      saveTokensToCache(tokens, true);
    } catch {
      // Silently fail - caching is optimization
    }
  }

  /**
   * Build batchexecute request body
   */
  private buildRequestBody(rpcId: string, params: unknown): string {
    const paramsJson = JSON.stringify(params);
    const fReq = [[[rpcId, paramsJson, null, "generic"]]];
    const fReqJson = JSON.stringify(fReq);

    const parts = [`f.req=${encodeURIComponent(fReqJson)}`];
    if (this.csrfToken) {
      parts.push(`at=${encodeURIComponent(this.csrfToken)}`);
    }

    return parts.join("&") + "&";
  }

  /**
   * Build batchexecute URL with query params
   */
  private buildUrl(rpcId: string, sourcePath = "/"): string {
    const params = new URLSearchParams({
      rpcids: rpcId,
      "source-path": sourcePath,
      bl: process.env.NOTEBOOKLM_BL || "boq_labs-tailwind-frontend_20260108.06_p0",
      hl: "en",
      rt: "c",
    });

    if (this.sessionId) {
      params.set("f.sid", this.sessionId);
    }

    return `${BATCHEXECUTE_URL}?${params.toString()}`;
  }

  /**
   * Parse batchexecute response
   */
  private parseResponse(responseText: string): unknown[] {
    // Remove anti-XSSI prefix
    let text = responseText;
    if (text.startsWith(")]}'")) {
      text = text.slice(4);
    }

    const lines = text.trim().split("\n");
    const results: unknown[] = [];

    let i = 0;
    while (i < lines.length) {
      const line = lines[i].trim();
      if (!line) {
        i++;
        continue;
      }

      // Try to parse as byte count
      const byteCount = parseInt(line, 10);
      if (!isNaN(byteCount)) {
        i++;
        if (i < lines.length) {
          try {
            const data = JSON.parse(lines[i]);
            results.push(data);
          } catch {
            // Skip invalid JSON
          }
        }
        i++;
      } else {
        // Try direct JSON parse
        try {
          const data = JSON.parse(line);
          results.push(data);
        } catch {
          // Skip
        }
        i++;
      }
    }

    return results;
  }

  /**
   * Extract RPC result from parsed response
   */
  private extractRpcResult(parsedResponse: unknown[], rpcId: string): unknown {
    for (const chunk of parsedResponse) {
      if (!Array.isArray(chunk)) continue;

      for (const item of chunk) {
        if (!Array.isArray(item) || item.length < 3) continue;

        if (item[0] === "wrb.fr" && item[1] === rpcId) {
          // Check for auth error (RPC Error 16)
          if (
            item.length > 6 &&
            item[6] === "generic" &&
            Array.isArray(item[5]) &&
            item[5].includes(16)
          ) {
            throw new Error("RPC Error 16: Authentication expired");
          }

          const resultStr = item[2];
          if (typeof resultStr === "string") {
            try {
              return JSON.parse(resultStr);
            } catch {
              return resultStr;
            }
          }
          return resultStr;
        }
      }
    }

    return null;
  }

  /**
   * Execute RPC call with recovery (retry, backoff, auth refresh)
   */
  private async callRpc(
    rpcId: string,
    params: unknown,
    path = "/",
    timeout: number = CONSTANTS.DEFAULT_TIMEOUT
  ): Promise<unknown> {
    // Ensure auth is ready before making calls
    await this.ensureAuth();
    
    const body = this.buildRequestBody(rpcId, params);
    const url = this.buildUrl(rpcId, path);

    return fetchWithRecovery(
      () =>
        fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
            Origin: BASE_URL,
            Referer: `${BASE_URL}/`,
            Cookie: cookiesToHeader(this.cookies),
            "X-Same-Domain": "1",
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          },
          body,
          signal: AbortSignal.timeout(timeout),
        }),
      async (response) => {
        const text = await response.text();
        const parsed = this.parseResponse(text);
        const result = this.extractRpcResult(parsed, rpcId);
        
        // extractRpcResult throws "RPC Error 16" for auth errors
        // This will be caught and trigger auth refresh via onAuthError
        return result;
      },
      async () => {
        // Auth refresh callback
        return await this.refreshAuthTokens();
      }
    );
  }

  // =========================================================================
  // Notebook Operations
  // =========================================================================

  async listNotebooks(): Promise<Notebook[]> {
    const params = [null, 1, null, [2]];
    const result = await this.callRpc(RPC_IDS.LIST_NOTEBOOKS, params);

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
        modifiedAt = this.parseTimestamp(metadata[5]);
        createdAt = this.parseTimestamp(metadata[8]);
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

  async createNotebook(title = ""): Promise<Notebook | null> {
    const params = [title, null, null, [2], [1, null, null, null, null, null, null, null, null, null, [1]]];
    const result = await this.callRpc(RPC_IDS.CREATE_NOTEBOOK, params);

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

  async getNotebook(notebookId: string): Promise<unknown> {
    return this.callRpc(
      RPC_IDS.GET_NOTEBOOK,
      [notebookId, null, [2], null, 0],
      `/notebook/${notebookId}`
    );
  }

  async deleteNotebook(notebookId: string): Promise<boolean> {
    const params = [[notebookId], [2]];
    const result = await this.callRpc(RPC_IDS.DELETE_NOTEBOOK, params);
    return result !== null;
  }

  async renameNotebook(notebookId: string, newTitle: string): Promise<boolean> {
    const params = [notebookId, [[null, null, null, [null, newTitle]]]];
    const result = await this.callRpc(
      RPC_IDS.RENAME_NOTEBOOK,
      params,
      `/notebook/${notebookId}`
    );
    return result !== null;
  }

  async getNotebookSummary(notebookId: string): Promise<NotebookSummary> {
    const result = await this.callRpc(
      RPC_IDS.GET_SUMMARY,
      [notebookId, [2]],
      `/notebook/${notebookId}`
    );

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

  // =========================================================================
  // Source Operations
  // =========================================================================

  async addUrlSource(notebookId: string, url: string): Promise<Source | null> {
    // Reference: [[source_data], notebook_id, [2], [1, null, ...]]
    // URL source_data: [2, url]
    const params = [[[2, url]], notebookId, [2], [1, null, null, null, null, null, null, 1]];
    const result = await this.callRpc(
      RPC_IDS.ADD_SOURCE,
      params,
      `/notebook/${notebookId}`,
      CONSTANTS.SOURCE_ADD_TIMEOUT
    );

    if (result && Array.isArray(result) && result[0]) {
      const sourceData = result[0];
      const sourceId = sourceData[0]?.[0];
      const title = sourceData[1] || url;
      return { id: sourceId, title };
    }

    return null;
  }

  async addTextSource(notebookId: string, text: string, title = "Pasted Text"): Promise<Source | null> {
    // Reference: [[source_data], notebook_id, [2], [1, null, ...]]
    // Text source_data: [1, [title, text]] - title first, then text!
    const params = [[[1, [title, text]]], notebookId, [2], [1, null, null, null, null, null, null, 1]];
    const result = await this.callRpc(
      RPC_IDS.ADD_SOURCE,
      params,
      `/notebook/${notebookId}`,
      CONSTANTS.SOURCE_ADD_TIMEOUT
    );

    if (result && Array.isArray(result) && result[0]) {
      const sourceData = result[0];
      const sourceId = sourceData[0]?.[0];
      return { id: sourceId, title };
    }

    return null;
  }

  async addDriveSource(
    notebookId: string,
    documentId: string,
    title: string,
    mimeType: string
  ): Promise<Source | null> {
    // Reference: [[source_data], notebook_id, [2], [1, null, ...]]
    // Drive source_data: [3, [doc_id, mime_type, 1, title]]
    const params = [[[3, [documentId, mimeType, 1, title]]], notebookId, [2], [1, null, null, null, null, null, null, 1]];
    const result = await this.callRpc(
      RPC_IDS.ADD_SOURCE,
      params,
      `/notebook/${notebookId}`,
      CONSTANTS.SOURCE_ADD_TIMEOUT
    );

    if (result && Array.isArray(result) && result[0]) {
      const sourceData = result[0];
      const sourceId = sourceData[0]?.[0];
      return { id: sourceId, title };
    }

    return null;
  }

  async getSourceGuide(sourceId: string): Promise<SourceGuide> {
    const result = await this.callRpc(RPC_IDS.GET_SOURCE_GUIDE, [[[[sourceId]]]]);

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

  async getSourceContent(sourceId: string): Promise<SourceContent> {
    const params = [[sourceId], [2], [2]];
    const result = await this.callRpc(RPC_IDS.GET_SOURCE, params);

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
          sourceType = this.getSourceTypeName(metadata[4]);
        }
        if (metadata[7]?.[0]) {
          url = metadata[7][0];
        }
      }

      // Extract content from result[3][0]
      if (result[3]?.[0]) {
        const textParts = this.extractAllText(result[3][0]);
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

  async deleteSource(sourceId: string): Promise<boolean> {
    const params = [[[sourceId]], [2]];
    const result = await this.callRpc(RPC_IDS.DELETE_SOURCE, params);
    return result !== null;
  }

  async checkSourceFreshness(sourceId: string): Promise<boolean | null> {
    const params = [null, [sourceId], [2]];
    const result = await this.callRpc(RPC_IDS.CHECK_FRESHNESS, params);

    if (result && Array.isArray(result)) {
      const inner = result[0];
      if (Array.isArray(inner) && inner.length >= 2) {
        return inner[1]; // true = fresh, false = stale
      }
    }

    return null;
  }

  async syncDriveSource(sourceId: string): Promise<{ id: string; title: string; syncedAt: number | null } | null> {
    const params = [null, [sourceId], [2]];
    const result = await this.callRpc(RPC_IDS.SYNC_DRIVE, params);

    if (result && Array.isArray(result) && result[0]) {
      const sourceData = result[0];
      const id = sourceData[0]?.[0];
      const title = sourceData[1] || "Unknown";
      let syncedAt: number | null = null;

      if (sourceData[2]?.[3]?.[1]?.[0]) {
        syncedAt = sourceData[2][3][1][0];
      }

      return { id, title, syncedAt };
    }

    return null;
  }

  // =========================================================================
  // Query Operations
  // =========================================================================

  async query(
    notebookId: string,
    queryText: string,
    sourceIds?: string[],
    conversationId?: string,
    timeout: number = CONSTANTS.QUERY_TIMEOUT
  ): Promise<QueryResult> {
    // Get source IDs if not provided
    let effectiveSourceIds: string[] = sourceIds || [];
    if (effectiveSourceIds.length === 0) {
      try {
        const notebook = await this.getNotebook(notebookId);
        // notebook is raw RPC response array. Sources are at index 1.
        if (Array.isArray(notebook) && notebook.length > 1 && Array.isArray(notebook[1])) {
           effectiveSourceIds = notebook[1].map((s: any) => {
               if (!Array.isArray(s) || s.length < 1) return null;
               const idData = s[0];
               // Handle both [[id]] and [id] formats, and direct id string
               if (Array.isArray(idData) && idData.length > 0) return idData[0];
               if (typeof idData === "string") return idData;
               return null;
           }).filter((id: any) => typeof id === "string" && id.length > 0);
        }
      } catch {
        // Ignore error, will fail later if no sources
      }
    }

    if (effectiveSourceIds.length === 0) {
      throw new Error("No sources found. Please add sources to the notebook or specify source_ids.");
    }

    // Build conversation history if this is a follow-up
    const conversationHistory = conversationId
      ? this.buildConversationHistory(conversationId)
      : null;

    // Generate conversation ID if new conversation
    const effectiveConversationId = conversationId || crypto.randomUUID();

    // Build sources array: [[[sid]]] for each source (3 brackets!)
    // Reference: sources_array = [[[sid]] for sid in source_ids] creates [[[s1]], [[s2]]]
    const sourcesArray = effectiveSourceIds.map((sid) => [[[sid]]]);

    // Query params structure (matching reference implementation)
    const queryParams = [
      sourcesArray,              // [0] sources as [[[sid]]] per source
      queryText,                 // [1] the query text
      conversationHistory,       // [2] null for new, history array for follow-ups
      [2, null, [1]],            // [3] config array
      effectiveConversationId,   // [4] conversation ID
    ];

    // Build f.req as [null, params_json] matching reference (compact JSON)
    const paramsJson = JSON.stringify(queryParams);
    const fReq = JSON.stringify([null, paramsJson]);

    // Use streaming query endpoint
    this.reqidCounter += 100000;
    const reqId = this.reqidCounter;

    // Build body with URL encoding matching reference (trailing &)
    const bodyParts = [
      `f.req=${encodeURIComponent(fReq)}`,
      `at=${encodeURIComponent(this.csrfToken)}`,
    ];
    const body = bodyParts.join("&") + "&";

    // Build URL with all required params
    const urlParams = new URLSearchParams({
      bl: process.env.NOTEBOOKLM_BL || "boq_labs-tailwind-frontend_20260108.06_p0",
      hl: "en",
      _reqid: String(reqId),
      rt: "c",
    });
    if (this.sessionId) {
      urlParams.set("f.sid", this.sessionId);
    }

    const response = await fetch(`${BASE_URL}${QUERY_ENDPOINT}?${urlParams.toString()}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        Cookie: cookiesToHeader(this.cookies),
        Origin: BASE_URL,
        Referer: `${BASE_URL}/notebook/${notebookId}`,
        "X-Same-Domain": "1",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
      body,
      signal: AbortSignal.timeout(timeout),
    });

    if (!response.ok) {
      const errorText = await response.text();
      // Try to extract useful error message from HTML/text
      const shortError = errorText.length > 200 ? errorText.substring(0, 200) + "..." : errorText;
      throw new Error(`Query failed: HTTP ${response.status} - ${shortError}`);
    }

    const text = await response.text();
    
    // Parse response
    let answer = "";
    let newConversationId: string | null = null;
    
    try {
      const result = this.parseQueryResponse(text);
      answer = result.answer;
      newConversationId = result.newConversationId;
    } catch (e: any) {
      throw e;
    }

    if (!answer) {
      throw new Error("NotebookLM returned no answer. Ensure your query is relevant to the selected sources.");
    }

    // Cache conversation turn
    const convId = newConversationId || conversationId || crypto.randomUUID();
    this.cacheConversationTurn(convId, queryText, answer);

    return {
      answer,
      conversationId: convId,
    };
  }

  private parseQueryResponse(text: string): { answer: string; newConversationId: string | null } {
    // Remove anti-XSSI prefix
    let responseText = text;
    if (responseText.startsWith(")]}'")) {
      responseText = responseText.slice(4);
    }

    const lines = responseText.trim().split("\n");

    let longestAnswer = "";
    let longestThinking = "";
    let conversationId: string | null = null;

    // Parse chunks - prioritize type 1 (answers) over type 2 (thinking)
    let i = 0;
    while (i < lines.length) {
      const line = lines[i].trim();
      if (!line) {
        i++;
        continue;
      }

      // Try to parse as byte count (indicates next line is JSON)
      const byteCount = parseInt(line, 10);
      if (!isNaN(byteCount) && byteCount > 0) {
        i++;
        if (i < lines.length) {
          const { text: extractedText, isAnswer, error } = this.extractAnswerFromChunk(lines[i]);
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
        // Not a byte count, try to parse as JSON directly
        const { text: extractedText, isAnswer, error } = this.extractAnswerFromChunk(line);
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

    // Return answer if found, otherwise fall back to thinking
    const answer = longestAnswer || longestThinking;
    return { answer, newConversationId: conversationId };
  }

  private extractAnswerFromChunk(jsonStr: string): { text: string | null; isAnswer: boolean; error?: string } {
    try {
      const data = JSON.parse(jsonStr);
      if (!Array.isArray(data) || data.length === 0) {
        return { text: null, isAnswer: false };
      }

      for (const item of data) {
        if (!Array.isArray(item) || item.length < 3) continue;
        if (item[0] !== "wrb.fr") continue;

        // Check for error signature: ["wrb.fr", "RPC_ID", null, null, null, [16], "generic"]
        if (item.length > 6 && item[6] === "generic") {
            if (Array.isArray(item[5]) && item[5].includes(16)) {
                 return { text: null, isAnswer: false, error: "Authentication expired (RPC Error 16). Please run 'notebooklm-mcp-auth'." };
            }
            return { text: null, isAnswer: false, error: "Generic RPC Error from NotebookLM." };
        }

        const innerJsonStr = item[2];
        if (typeof innerJsonStr !== "string") continue;

        try {
          const innerData = JSON.parse(innerJsonStr);

          // Type indicator is at innerData[0][4][-1]: 1 = answer, 2 = thinking
          if (Array.isArray(innerData) && innerData.length > 0) {
            const firstElem = innerData[0];
            if (Array.isArray(firstElem) && firstElem.length > 0) {
              const answerText = firstElem[0];
              if (typeof answerText === "string" && answerText.length > 20) {
                // Check type indicator at firstElem[4][-1]
                let isAnswer = false;
                if (firstElem.length > 4 && Array.isArray(firstElem[4])) {
                  const typeInfo = firstElem[4];
                  // The type is at the last element: 1 (answer) or 2 (thinking)
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

  private buildConversationHistory(conversationId: string): unknown[] | null {
    const turns = this.conversationCache.get(conversationId);
    if (!turns?.length) return null;

    const history: unknown[] = [];
    for (const turn of turns) {
      history.push([turn.answer, null, 2]);
      history.push([turn.query, null, 1]);
    }

    return history;
  }

  private cacheConversationTurn(conversationId: string, query: string, answer: string): void {
    if (!this.conversationCache.has(conversationId)) {
      this.conversationCache.set(conversationId, []);
    }

    const turns = this.conversationCache.get(conversationId)!;
    turns.push({
      query,
      answer,
      turnNumber: turns.length + 1,
    });
  }

  // =========================================================================
  // Research Operations
  // =========================================================================

  async startResearch(
    query: string,
    source: "web" | "drive" = "web",
    mode: "fast" | "deep" = "fast",
    notebookId?: string,
    title?: string
  ): Promise<{ notebookId: string; taskId: string }> {
    // Create notebook if not provided
    let nbId = notebookId;
    if (!nbId) {
      const nb = await this.createNotebook(title || `Research: ${query}`);
      if (!nb) throw new Error("Failed to create notebook");
      nbId = nb.id;
    }

    const sourceCode = source === "drive" 
      ? CONSTANTS.RESEARCH_SOURCE_DRIVE 
      : CONSTANTS.RESEARCH_SOURCE_WEB;

    const rpcId = mode === "deep" ? RPC_IDS.START_DEEP_RESEARCH : RPC_IDS.START_FAST_RESEARCH;

    // Research params structure (matching reference implementation)
    // Fast: [[query, source_type], null, 1, notebook_id]
    // Deep: [null, [1], [query, source_type], 5, notebook_id]
    const params = mode === "deep"
      ? [null, [1], [query, sourceCode], 5, nbId]
      : [[query, sourceCode], null, 1, nbId];
    const result = await this.callRpc(rpcId, params, `/notebook/${nbId}`);

    // Extract task ID from response
    let taskId = "";
    if (result && Array.isArray(result) && result[0]) {
      taskId = result[0];
    }

    return { notebookId: nbId, taskId };
  }

  async pollResearch(notebookId: string, taskId?: string): Promise<ResearchTask> {
    const params = [notebookId, taskId || null, [2]];
    const result = await this.callRpc(
      RPC_IDS.POLL_RESEARCH,
      params,
      `/notebook/${notebookId}`
    );

    let status: "pending" | "running" | "completed" | "failed" = "pending";
    const sources: { index: number; title: string; url?: string; type: string }[] = [];
    let report = "";

    if (result && Array.isArray(result)) {
      // Parse status
      const statusCode = result[0];
      if (statusCode === 2) status = "completed";
      else if (statusCode === 1) status = "running";
      else if (statusCode === 3) status = "failed";

      // Parse sources
      if (result[1] && Array.isArray(result[1])) {
        let index = 0;
        for (const src of result[1]) {
          if (Array.isArray(src)) {
            sources.push({
              index: index++,
              title: src[0] || "",
              url: src[1] || undefined,
              type: this.getResearchResultType(src[2]),
            });
          }
        }
      }

      // Parse report (for deep research)
      if (result[2]) {
        report = result[2];
      }
    }

    return {
      taskId: taskId || "",
      notebookId,
      status,
      sources,
      report: report || undefined,
    };
  }

  async importResearchSources(
    notebookId: string,
    taskId: string,
    sourceIndices?: number[]
  ): Promise<number> {
    const params = [notebookId, taskId, sourceIndices || null, [2]];
    const result = await this.callRpc(
      RPC_IDS.IMPORT_RESEARCH,
      params,
      `/notebook/${notebookId}`
    );

    // Return count of imported sources
    if (result && Array.isArray(result)) {
      return result.length;
    }

    return 0;
  }

  // =========================================================================
  // Studio Operations (Audio/Video/Infographic/etc)
  // =========================================================================

  async createStudioContent(
    notebookId: string,
    type: "audio" | "video" | "infographic" | "slide_deck" | "report" | "flashcards" | "quiz" | "data_table",
    options: Record<string, unknown> = {},
    sourceIds?: string[]
  ): Promise<string> {
    const typeCode = this.getStudioTypeCode(type);
    const sourceFilter = sourceIds?.map((id) => [id]) || null;

    const params = [notebookId, typeCode, options, sourceFilter, [2]];
    const result = await this.callRpc(
      RPC_IDS.CREATE_STUDIO,
      params,
      `/notebook/${notebookId}`
    );

    // Return artifact ID
    if (result && Array.isArray(result) && result[0]) {
      return result[0];
    }

    throw new Error("Failed to create studio content");
  }

  async pollStudioStatus(notebookId: string): Promise<StudioArtifact[]> {
    const params = [notebookId, [2]];
    const result = await this.callRpc(
      RPC_IDS.POLL_STUDIO,
      params,
      `/notebook/${notebookId}`
    );

    const artifacts: StudioArtifact[] = [];

    if (result && Array.isArray(result)) {
      for (const item of result) {
        if (Array.isArray(item)) {
          artifacts.push({
            id: item[0] || "",
            type: this.getStudioTypeName(item[1]),
            status: this.getStudioStatus(item[2]),
            url: item[3] || undefined,
            createdAt: this.parseTimestamp(item[4]) || "",
          });
        }
      }
    }

    return artifacts;
  }

  async deleteStudioArtifact(notebookId: string, artifactId: string): Promise<boolean> {
    const params = [notebookId, artifactId, [2]];
    const result = await this.callRpc(
      RPC_IDS.DELETE_STUDIO,
      params,
      `/notebook/${notebookId}`
    );
    return result !== null;
  }

  // =========================================================================
  // Mind Map Operations
  // =========================================================================

  async createMindMap(
    notebookId: string,
    sourceIds?: string[],
    title?: string
  ): Promise<{ id: string; content: unknown }> {
    const sourceFilter = sourceIds?.map((id) => [id]) || null;

    // Generate mind map
    const generateParams = [notebookId, sourceFilter, [2]];
    const generated = await this.callRpc(
      RPC_IDS.GENERATE_MIND_MAP,
      generateParams,
      `/notebook/${notebookId}`
    );

    if (!generated) {
      throw new Error("Failed to generate mind map");
    }

    // Save mind map
    const saveParams = [notebookId, title || "Mind Map", generated, [2]];
    const saved = await this.callRpc(
      RPC_IDS.SAVE_MIND_MAP,
      saveParams,
      `/notebook/${notebookId}`
    );

    return {
      id: Array.isArray(saved) && typeof saved[0] === "string" ? saved[0] : "",
      content: generated,
    };
  }

  // =========================================================================
  // Chat Configuration
  // =========================================================================

  async configureChat(
    notebookId: string,
    config: ChatConfig
  ): Promise<boolean> {
    const goalCode = this.getChatGoalCode(config.goal);
    const lengthCode = this.getResponseLengthCode(config.responseLength);

    const goalSetting = config.goal === "custom" && config.customPrompt
      ? [goalCode, config.customPrompt]
      : [goalCode];

    const chatSettings = [goalSetting, [lengthCode]];
    const params = [notebookId, [[null, null, null, null, null, null, null, chatSettings]]];

    const result = await this.callRpc(
      RPC_IDS.RENAME_NOTEBOOK,
      params,
      `/notebook/${notebookId}`
    );

    return result !== null;
  }

  // =========================================================================
  // Helper Methods
  // =========================================================================

  private parseTimestamp(tsArray: unknown): string | null {
    if (!Array.isArray(tsArray) || tsArray.length < 1) return null;
    
    const seconds = tsArray[0];
    if (typeof seconds !== "number") return null;

    try {
      return new Date(seconds * 1000).toISOString();
    } catch {
      return null;
    }
  }

  private extractAllText(data: unknown[]): string[] {
    const texts: string[] = [];
    for (const item of data) {
      if (typeof item === "string" && item.length > 0) {
        texts.push(item);
      } else if (Array.isArray(item)) {
        texts.push(...this.extractAllText(item));
      }
    }
    return texts;
  }

  private getSourceTypeName(code: number): string {
    const types: Record<number, string> = {
      1: "google_docs",
      2: "google_other",
      4: "pasted_text",
      5: "web",
    };
    return types[code] || "unknown";
  }

  private getResearchResultType(code: number): string {
    const types: Record<number, string> = {
      1: "web",
      2: "google_doc",
      3: "google_slides",
      4: "deep_report",
      5: "google_sheets",
    };
    return types[code] || "unknown";
  }

  private getStudioTypeCode(type: string): number {
    const codes: Record<string, number> = {
      audio: CONSTANTS.STUDIO_TYPE_AUDIO,
      video: CONSTANTS.STUDIO_TYPE_VIDEO,
      infographic: CONSTANTS.STUDIO_TYPE_INFOGRAPHIC,
      slide_deck: CONSTANTS.STUDIO_TYPE_SLIDE_DECK,
      report: CONSTANTS.STUDIO_TYPE_REPORT,
      flashcards: CONSTANTS.STUDIO_TYPE_FLASHCARDS,
      quiz: CONSTANTS.STUDIO_TYPE_FLASHCARDS, // Same type, different options
      data_table: CONSTANTS.STUDIO_TYPE_DATA_TABLE,
    };
    return codes[type] || 1;
  }

  private getStudioTypeName(code: number): StudioArtifact["type"] {
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

  private getStudioStatus(code: number): StudioArtifact["status"] {
    const statuses: Record<number, StudioArtifact["status"]> = {
      0: "pending",
      1: "generating",
      2: "ready",
      3: "failed",
    };
    return statuses[code] || "pending";
  }

  private getChatGoalCode(goal: ChatConfig["goal"]): number {
    const codes: Record<string, number> = {
      default: CONSTANTS.CHAT_GOAL_DEFAULT,
      learning_guide: CONSTANTS.CHAT_GOAL_LEARNING_GUIDE,
      custom: CONSTANTS.CHAT_GOAL_CUSTOM,
    };
    return codes[goal] || CONSTANTS.CHAT_GOAL_DEFAULT;
  }

  private getResponseLengthCode(length: ChatConfig["responseLength"]): number {
    const codes: Record<string, number> = {
      default: CONSTANTS.CHAT_RESPONSE_DEFAULT,
      longer: CONSTANTS.CHAT_RESPONSE_LONGER,
      shorter: CONSTANTS.CHAT_RESPONSE_SHORTER,
    };
    return codes[length] || CONSTANTS.CHAT_RESPONSE_DEFAULT;
  }
}

// ============================================================================
// Client Singleton
// ============================================================================

let _client: NotebookLMClient | null = null;

export function getClient(): NotebookLMClient {
  if (!_client) {
    const cached = loadCachedTokens();
    if (!cached) {
      throw new Error(
        "No authentication found. Run 'notebooklm-mcp-auth' to authenticate."
      );
    }

    _client = new NotebookLMClient(
      cached.cookies,
      cached.csrfToken,
      cached.sessionId
    );
  }

  return _client;
}

export function resetClient(): void {
  _client = null;
}
