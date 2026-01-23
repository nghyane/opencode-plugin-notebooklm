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
    // URL source format: [null,null,["url"],null,null,null,null,null,null,null,1]
    const urlSourceData = [null, null, [url], null, null, null, null, null, null, null, 1];
    const options = [1, null, null, null, null, null, null, null, null, null, [1]];
    const params = [[urlSourceData], notebookId, [2], options];
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

  async addUrls(notebookId: string, urls: string[]): Promise<Source[]> {
    if (urls.length === 0) return [];
    if (urls.length === 1) {
      const source = await this.addUrl(notebookId, urls[0]!);
      return source ? [source] : [];
    }
    
    // Batch add: each URL as [null,null,["url"],null,null,null,null,null,null,null,1]
    const urlParams = urls.map(url => [null, null, [url], null, null, null, null, null, null, null, 1]);
    const options = [1, null, null, null, null, null, null, null, null, null, [1]];
    const params = [urlParams, notebookId, [2], options];
    const result = await this.transport.call(
      RPC_IDS.ADD_SOURCE,
      params,
      { 
        path: `/notebook/${notebookId}`,
        timeout: Config.SOURCE_ADD_TIMEOUT,
      }
    );
    
    const sources: Source[] = [];
    if (result && Array.isArray(result)) {
      for (let i = 0; i < result.length; i++) {
        const sourceData = result[i];
        if (sourceData) {
          const sourceId = sourceData[0]?.[0];
          const title = sourceData[1] || (urls[i] ?? "Unknown");
          if (sourceId) {
            sources.push({ id: sourceId, title });
          }
        }
      }
    }
    return sources;
  }

  async addText(notebookId: string, text: string, title = "Pasted Text"): Promise<Source | null> {
    // Text source_data: [null,["title","text"],null,2,null,null,null,null,null,null,1]
    const textSourceData = [null, [title, text], null, 2, null, null, null, null, null, null, 1];
    const options = [1, null, null, null, null, null, null, null, null, null, [1]];
    const params = [[textSourceData], notebookId, [2], options];
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
    // Drive source_data: [[docId, mimeType, 1, title], null, null, null, null, null, null, null, null, null, 1]
    const driveSourceData = [[documentId, mimeType, 1, title], null, null, null, null, null, null, null, null, null, 1];
    const options = [1, null, null, null, null, null, null, null, null, null, [1]];
    const params = [[driveSourceData], notebookId, [2], options];
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
