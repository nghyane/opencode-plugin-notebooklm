/**
 * NotebookLM Client - Main facade
 *
 * Clean architecture with separated concerns:
 * - Transport: HTTP communication
 * - Services: Domain-specific operations
 * - Codec: Response parsing
 */

import { getAuthManager } from "../auth/manager";
import { cookiesToHeader } from "../auth/tokens";
import { AppError } from "../errors";
import { RpcTransport } from "./transport";
import { NotebookService } from "./services/notebook";
import { SourceService } from "./services/source";
import { QueryService } from "./services/query";
import { ResearchService } from "./services/research";
import { StudioService } from "./services/studio";

export class NotebookLMClient {
  private transport: RpcTransport;

  // Services
  readonly notebooks: NotebookService;
  readonly sources: SourceService;
  readonly queries: QueryService;
  readonly research: ResearchService;
  readonly studio: StudioService;

  constructor() {
    const authManager = getAuthManager();
    const tokens = authManager.getTokens();

    if (!tokens) {
      throw AppError.authMissing();
    }

    // Create transport with AuthManager callbacks
    this.transport = new RpcTransport({
      cookies: tokens.cookies,
      csrfToken: tokens.csrfToken,
      sessionId: tokens.sessionId,
      onAuthRefresh: () => authManager.refreshCsrf(),
      onDiskReload: () => authManager.initialize(),
      onCDPRefresh: () => authManager.refresh(),
    });

    // Initialize services
    this.notebooks = new NotebookService(this.transport);
    this.sources = new SourceService(this.transport);
    this.queries = new QueryService(this.transport);
    this.research = new ResearchService(this.transport);
    this.studio = new StudioService(this.transport);

    // Subscribe to auth state changes to update transport
    authManager.subscribe((state) => {
      if (state.status === 'authenticated') {
        this.transport.updateFullAuth(
          state.tokens.cookies,
          state.tokens.csrfToken,
          state.tokens.sessionId
        );
      }
    });
  }

  // =========================================================================
  // Convenience methods (delegates to services)
  // =========================================================================

  // Notebook operations
  async listNotebooks() {
    return this.notebooks.list();
  }
  async createNotebook(title = "") {
    return this.notebooks.create(title);
  }
  async getNotebook(id: string) {
    return this.notebooks.getRaw(id);
  }
  async deleteNotebook(id: string) {
    return this.notebooks.delete(id);
  }
  async renameNotebook(id: string, title: string) {
    return this.notebooks.rename(id, title);
  }
  async getNotebookSummary(id: string) {
    return this.notebooks.getSummary(id);
  }

  // Source operations
  async addUrlSource(notebookId: string, url: string) {
    return this.sources.addUrl(notebookId, url);
  }
  async addUrlSources(notebookId: string, urls: string[]) {
    return this.sources.addUrls(notebookId, urls);
  }
  async addTextSource(notebookId: string, text: string, title?: string) {
    return this.sources.addText(notebookId, text, title);
  }
  async addDriveSource(
    notebookId: string,
    docId: string,
    title: string,
    mimeType: string
  ) {
    return this.sources.addDrive(notebookId, docId, title, mimeType);
  }
  async getSourceGuide(sourceId: string) {
    return this.sources.getGuide(sourceId);
  }
  async getSourceContent(sourceId: string) {
    return this.sources.getContent(sourceId);
  }
  async deleteSource(sourceId: string) {
    return this.sources.delete(sourceId);
  }

  // Query operations
  async query(
    notebookId: string,
    queryText: string,
    sourceIds?: string[],
    conversationId?: string,
    timeout?: number
  ) {
    return this.queries.query(notebookId, queryText, {
      ...(sourceIds && { sourceIds }),
      ...(conversationId && { conversationId }),
      ...(timeout && { timeout }),
      getNotebookRaw: () => this.notebooks.getRaw(notebookId),
    });
  }

  // Research operations
  async startResearch(
    query: string,
    source?: "web" | "drive",
    mode?: "fast" | "deep",
    notebookId?: string,
    title?: string
  ) {
    let nbId = notebookId;
    if (!nbId) {
      const nb = await this.createNotebook(title || `Research: ${query}`);
      if (!nb) throw AppError.validation("Failed to create notebook");
      nbId = nb.id;
    }
    return this.research.start(query, {
      ...(source && { source }),
      ...(mode && { mode }),
      notebookId: nbId,
    });
  }
  async pollResearch(notebookId: string, taskId?: string) {
    return this.research.poll(notebookId, taskId);
  }
  async importResearchSources(
    notebookId: string,
    taskId: string,
    indices?: number[]
  ) {
    return this.research.importSources(notebookId, taskId, indices);
  }

  // Studio operations
  async createStudioContent(
    notebookId: string,
    type: any,
    options?: Record<string, unknown>,
    sourceIds?: string[]
  ) {
    return this.studio.create(notebookId, type, options, sourceIds);
  }
  async pollStudioStatus(notebookId: string) {
    return this.studio.pollStatus(notebookId);
  }
  async deleteStudioArtifact(notebookId: string, artifactId: string) {
    return this.studio.delete(notebookId, artifactId);
  }
  async createMindMap(
    notebookId: string,
    sourceIds?: string[],
    title?: string
  ) {
    return this.studio.createMindMap(notebookId, sourceIds, title);
  }
}

// ============================================================================
// Client Singleton
// ============================================================================

let _client: NotebookLMClient | null = null;
let _clientPromise: Promise<NotebookLMClient> | null = null;

/**
 * Get NotebookLM client (async, single-flight)
 * Triggers CDP auth if needed
 */
export async function getClient(): Promise<NotebookLMClient> {
  // Return existing client
  if (_client) return _client;
  
  // Return in-flight promise (single-flight)
  if (_clientPromise) return _clientPromise;
  
  // Create new client with single-flight
  _clientPromise = (async () => {
    const authManager = getAuthManager();
    const valid = await authManager.ensureValid();
    if (!valid) {
      throw AppError.authMissing();
    }
    _client = new NotebookLMClient();
    return _client;
  })();
  
  try {
    return await _clientPromise;
  } finally {
    _clientPromise = null;
  }
}

export function resetClient(): void {
  _client = null;
}
