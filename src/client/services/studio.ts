/**
 * Studio Service - handles audio/video/infographic generation
 */

import type { StudioArtifact, StudioType } from "../../types";
import { RPC_IDS, CONSTANTS } from "../../config";
import type { RpcTransport } from "../transport";
import { decodeStudioArtifacts } from "../codec";
import { AppError } from "../../errors";

export class StudioService {
  constructor(private transport: RpcTransport) {}

  /**
   * Create studio content (audio, video, infographic, etc.)
   */
  async create(
    notebookId: string,
    type: StudioType,
    options: Record<string, unknown> = {},
    sourceIds?: string[]
  ): Promise<string> {
    const typeCode = this.getTypeCode(type);
    const sourceFilter = sourceIds?.map((id) => [id]) || null;

    const params = [notebookId, typeCode, options, sourceFilter, [2]];
    const result = await this.transport.call(
      RPC_IDS.CREATE_STUDIO,
      params,
      { path: `/notebook/${notebookId}` }
    );

    // Return artifact ID
    if (result && Array.isArray(result) && result[0]) {
      return result[0];
    }

    throw AppError.validation("Failed to create studio content");
  }

  /**
   * Poll studio artifact statuses
   */
  async pollStatus(notebookId: string): Promise<StudioArtifact[]> {
    const params = [notebookId, [2]];
    const result = await this.transport.call(
      RPC_IDS.POLL_STUDIO,
      params,
      { path: `/notebook/${notebookId}` }
    );

    return decodeStudioArtifacts(result);
  }

  /**
   * Delete a studio artifact
   */
  async delete(notebookId: string, artifactId: string): Promise<boolean> {
    const params = [notebookId, artifactId, [2]];
    const result = await this.transport.call(
      RPC_IDS.DELETE_STUDIO,
      params,
      { path: `/notebook/${notebookId}` }
    );
    return result !== null;
  }

  /**
   * Create mind map
   */
  async createMindMap(
    notebookId: string,
    sourceIds?: string[],
    title?: string
  ): Promise<{ id: string; content: unknown }> {
    const sourceFilter = sourceIds?.map((id) => [id]) || null;

    // Generate mind map
    const generateParams = [notebookId, sourceFilter, [2]];
    const generated = await this.transport.call(
      RPC_IDS.GENERATE_MIND_MAP,
      generateParams,
      { path: `/notebook/${notebookId}` }
    );

    if (!generated) {
      throw AppError.validation("Failed to generate mind map");
    }

    // Save mind map
    const saveParams = [notebookId, title || "Mind Map", generated, [2]];
    const saved = await this.transport.call(
      RPC_IDS.SAVE_MIND_MAP,
      saveParams,
      { path: `/notebook/${notebookId}` }
    );

    return {
      id: Array.isArray(saved) && typeof saved[0] === "string" ? saved[0] : "",
      content: generated,
    };
  }

  private getTypeCode(type: StudioType): number {
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
}
