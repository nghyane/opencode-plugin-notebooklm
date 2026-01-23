/**
 * Research Service - handles web research operations
 */

import type { ResearchTask } from "../../types";
import { RPC_IDS, CONSTANTS } from "../../config";
import type { RpcTransport } from "../transport";
import { decodeResearchTask } from "../codec";

export class ResearchService {
  constructor(private transport: RpcTransport) {}

  /**
   * Start web/drive research
   */
  async start(
    query: string,
    options: {
      source?: "web" | "drive";
      mode?: "fast" | "deep";
      notebookId: string;
    }
  ): Promise<{ notebookId: string; taskId: string }> {
    const { source = "web", mode = "fast", notebookId } = options;

    const sourceCode = source === "drive" 
      ? CONSTANTS.RESEARCH_SOURCE_DRIVE 
      : CONSTANTS.RESEARCH_SOURCE_WEB;

    const rpcId = mode === "deep" ? RPC_IDS.START_DEEP_RESEARCH : RPC_IDS.START_FAST_RESEARCH;

    // Fast: [[query, source_type], null, 1, notebook_id]
    // Deep: [null, [1], [query, source_type], 5, notebook_id]
    const params = mode === "deep"
      ? [null, [1], [query, sourceCode], 5, notebookId]
      : [[query, sourceCode], null, 1, notebookId];

    const result = await this.transport.call(rpcId, params, { path: `/notebook/${notebookId}` });

    // Extract task ID from response
    let taskId = "";
    if (result && Array.isArray(result) && result[0]) {
      taskId = result[0];
    }

    return { notebookId, taskId };
  }

  /**
   * Poll research status
   */
  async poll(notebookId: string, taskId?: string): Promise<ResearchTask> {
    const params = [notebookId, taskId || null, [2]];
    const result = await this.transport.call(
      RPC_IDS.POLL_RESEARCH,
      params,
      { path: `/notebook/${notebookId}` }
    );

    return decodeResearchTask(result, taskId || "", notebookId);
  }

  /**
   * Import discovered sources into notebook
   */
  async importSources(
    notebookId: string,
    taskId: string,
    sourceIndices?: number[]
  ): Promise<number> {
    const params = [notebookId, taskId, sourceIndices || null, [2]];
    const result = await this.transport.call(
      RPC_IDS.IMPORT_RESEARCH,
      params,
      { path: `/notebook/${notebookId}` }
    );

    // Return count of imported sources
    if (result && Array.isArray(result)) {
      return result.length;
    }

    return 0;
  }
}
