/**
 * Query Service - handles notebook querying with conversation support
 */

import type { QueryResult, ConversationTurn } from "../../types";
import { Config } from "../../config";
import type { RpcTransport } from "../transport";
import { decodeQueryResponse, extractSourceIds } from "../codec";
import { loadConversations, saveConversations } from "../conversations";
import { AppError } from "../../errors";

export class QueryService {
  private conversationCache: Map<string, ConversationTurn[]>;

  constructor(private transport: RpcTransport) {
    this.conversationCache = loadConversations();
  }

  /**
   * Query notebook sources
   */
  async query(
    notebookId: string,
    queryText: string,
    options: {
      sourceIds?: string[];
      conversationId?: string;
      timeout?: number;
      getNotebookRaw?: () => Promise<unknown>;
    } = {}
  ): Promise<QueryResult> {
    const { sourceIds, conversationId, timeout = Config.QUERY_TIMEOUT, getNotebookRaw } = options;

    // Get source IDs if not provided
    let effectiveSourceIds = sourceIds || [];
    if (effectiveSourceIds.length === 0 && getNotebookRaw) {
      try {
        const notebook = await getNotebookRaw();
        effectiveSourceIds = extractSourceIds(notebook);
      } catch {
        // Ignore error, will fail later if no sources
      }
    }

    if (effectiveSourceIds.length === 0) {
      throw AppError.validation("No sources found. Please add sources to the notebook or specify source_ids.");
    }

    // Build conversation history if this is a follow-up
    const conversationHistory = conversationId
      ? this.buildConversationHistory(conversationId)
      : null;

    // Generate conversation ID if new conversation
    const effectiveConversationId = conversationId || crypto.randomUUID();

    // Build sources array: [[sid]] for each source (2 brackets!)
    const sourcesArray = effectiveSourceIds.map((sid) => [[sid]]);

    // Query params structure
    const queryParams = [
      sourcesArray,              // [0] sources
      queryText,                 // [1] the query text
      conversationHistory && conversationHistory.length > 0 ? conversationHistory : null, // [2] history
      [2, null, [1], [1]],       // [3] config array
      effectiveConversationId,   // [4] conversation ID
      null,                      // [5] unknown
      null,                      // [6] unknown
      null,                      // [7] unknown
      2,                         // [8] unknown (maybe mode?)
    ];

    // Execute streaming query
    const responseText = await this.transport.streamQuery(queryParams, notebookId, timeout);

    // Parse response
    const { answer, conversationId: newConversationId } = decodeQueryResponse(responseText);

    if (!answer) {
      throw AppError.validation("NotebookLM returned no answer. Ensure your query is relevant to the selected sources.");
    }

    // Cache conversation turn
    const convId = newConversationId || conversationId || crypto.randomUUID();
    this.cacheConversationTurn(convId, queryText, answer);

    return {
      answer,
      conversationId: convId,
    };
  }

  /**
   * Build conversation history for follow-up queries
   */
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

  /**
   * Cache and persist a conversation turn
   */
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

    // Persist to disk
    saveConversations(this.conversationCache);
  }

  /**
   * Get conversation history
   */
  getConversation(conversationId: string): ConversationTurn[] {
    return this.conversationCache.get(conversationId) || [];
  }

  /**
   * Clear a conversation
   */
  clearConversation(conversationId: string): void {
    this.conversationCache.delete(conversationId);
    saveConversations(this.conversationCache);
  }
}
