/**
 * Source Service - handles source CRUD operations
 */

import type { Source, SourceGuide, SourceContent } from "../../types";
import { RPC_IDS } from "../../config";
import { Config } from "../../config";
import type { RpcTransport } from "../transport";
import {
  decodeSource,
  decodeSourceGuide,
  decodeSourceContent,
} from "../codec";

export class SourceService {
  constructor(private transport: RpcTransport) {}

  async addUrl(notebookId: string, url: string): Promise<Source | null> {
    const params = [[[2, url]], notebookId, [2], [1, null, null, null, null, null, null, 1]];
    const result = await this.transport.call(
      RPC_IDS.ADD_SOURCE,
      params,
      { 
        path: `/notebook/${notebookId}`,
        timeout: Config.SOURCE_ADD_TIMEOUT,
      }
    );
    
    if (result && Array.isArray(result) && result[0]) {
      const sourceData = result[0];
      const sourceId = sourceData[0]?.[0];
      const title = sourceData[1] || url;
      return { id: sourceId, title };
    }
    return null;
  }

  async addText(notebookId: string, text: string, title = "Pasted Text"): Promise<Source | null> {
    // Text source_data: [1, [title, text]] - title first, then text!
    const params = [[[1, [title, text]]], notebookId, [2], [1, null, null, null, null, null, null, 1]];
    const result = await this.transport.call(
      RPC_IDS.ADD_SOURCE,
      params,
      { 
        path: `/notebook/${notebookId}`,
        timeout: Config.SOURCE_ADD_TIMEOUT,
      }
    );
    
    if (result && Array.isArray(result) && result[0]) {
      const sourceData = result[0];
      const sourceId = sourceData[0]?.[0];
      return { id: sourceId, title };
    }
    return null;
  }

  async addDrive(
    notebookId: string,
    documentId: string,
    title: string,
    mimeType: string
  ): Promise<Source | null> {
    // Drive source_data: [3, [doc_id, mime_type, 1, title]]
    const params = [[[3, [documentId, mimeType, 1, title]]], notebookId, [2], [1, null, null, null, null, null, null, 1]];
    const result = await this.transport.call(
      RPC_IDS.ADD_SOURCE,
      params,
      { 
        path: `/notebook/${notebookId}`,
        timeout: Config.SOURCE_ADD_TIMEOUT,
      }
    );
    
    if (result && Array.isArray(result) && result[0]) {
      const sourceData = result[0];
      const sourceId = sourceData[0]?.[0];
      return { id: sourceId, title };
    }
    return null;
  }

  async getGuide(sourceId: string): Promise<SourceGuide> {
    const result = await this.transport.call(RPC_IDS.GET_SOURCE_GUIDE, [[[[sourceId]]]]);
    return decodeSourceGuide(result);
  }

  async getContent(sourceId: string): Promise<SourceContent> {
    const params = [[sourceId], [2], [2]];
    const result = await this.transport.call(RPC_IDS.GET_SOURCE, params);
    return decodeSourceContent(result);
  }

  async delete(sourceId: string): Promise<boolean> {
    const params = [[[sourceId]], [2]];
    const result = await this.transport.call(RPC_IDS.DELETE_SOURCE, params);
    return result !== null;
  }

  async checkFreshness(sourceId: string): Promise<boolean | null> {
    const params = [null, [sourceId], [2]];
    const result = await this.transport.call(RPC_IDS.CHECK_FRESHNESS, params);

    if (result && Array.isArray(result)) {
      const inner = result[0];
      if (Array.isArray(inner) && inner.length >= 2) {
        return inner[1]; // true = fresh, false = stale
      }
    }
    return null;
  }

  async syncDrive(sourceId: string): Promise<{ id: string; title: string; syncedAt: number | null } | null> {
    const params = [null, [sourceId], [2]];
    const result = await this.transport.call(RPC_IDS.SYNC_DRIVE, params);

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
}
