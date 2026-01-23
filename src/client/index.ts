/**
 * NotebookLM Client - Main facade
 *
 * Clean architecture with separated concerns:
 * - Transport: HTTP communication
 * - Services: Domain-specific operations
 * - Codec: Response parsing
 */

import { Config } from "../config";
import { AppError } from "../errors";
import { RpcTransport } from "./transport";
import { NotebookService } from "./services/notebook";
import { SourceService } from "./services/source";
import { QueryService } from "./services/query";
import { ResearchService } from "./services/research";
import { StudioService } from "./services/studio";
import {
  loadCachedTokens,
  saveTokensToCache,
  cookiesToHeader,
  extractCsrfFromHtml,
  extractSessionIdFromHtml,
  isTokenExpired,
  type AuthTokens,
} from "../auth/tokens";

export class NotebookLMClient {
  private transport: RpcTransport;
  private cookies: Record<string, string>;
  private csrfToken: string;
  private sessionId: string;
  private authRefreshPromise: Promise<boolean> | null = null;

  // Services
  readonly notebooks: NotebookService;
  readonly sources: SourceService;
  readonly queries: QueryService;
  readonly research: ResearchService;
  readonly studio: StudioService;

  constructor(cookies: Record<string, string>, csrfToken = "", sessionId = "") {
    this.cookies = cookies;
    this.csrfToken = csrfToken;
    this.sessionId = sessionId;

    // Create transport
    this.transport = new RpcTransport({
      cookies,
      csrfToken,
      sessionId,
      onAuthRefresh: () => this.refreshAuthTokens(),
    });

    // Initialize services
    this.notebooks = new NotebookService(this.transport);
    this.sources = new SourceService(this.transport);
    this.queries = new QueryService(this.transport);
    this.research = new ResearchService(this.transport);
    this.studio = new StudioService(this.transport);

    // Schedule CSRF refresh if not provided
    if (!this.csrfToken) {
      this.authRefreshPromise = this.refreshAuthTokens();
    }
  }

  /**
   * Ensure auth is ready before making API calls
   * Proactively refreshes if tokens are expired
   */
  async ensureAuth(): Promise<void> {
    // Wait for any in-flight refresh
    if (this.authRefreshPromise) {
      await this.authRefreshPromise;
    }

    // Check if tokens are expired and proactively refresh
    const cached = loadCachedTokens();
    if (cached && isTokenExpired(cached)) {
      await this.refreshAuthTokens();
    }
  }

  /**
   * Refresh CSRF token and session ID by fetching NotebookLM homepage
   * Uses mutex pattern to prevent concurrent refresh attempts
   */
  async refreshAuthTokens(): Promise<boolean> {
    // Mutex: reuse in-flight refresh promise
    if (this.authRefreshPromise) {
      return this.authRefreshPromise;
    }

    this.authRefreshPromise = this.doRefreshAuthTokens().finally(() => {
      this.authRefreshPromise = null;
    });

    return this.authRefreshPromise;
  }

  /**
   * Internal refresh implementation
   */
  private async doRefreshAuthTokens(): Promise<boolean> {
    try {
      const response = await fetch(Config.BASE_URL + "/", {
        headers: {
          ...Config.PAGE_FETCH_HEADERS,
          Cookie: cookiesToHeader(this.cookies),
        },
        redirect: "follow",
      });

      if (response.url.includes("accounts.google.com")) {
        throw AppError.authExpired("Session redirected to Google login");
      }

      if (!response.ok) {
        throw AppError.fromStatus(response.status, "Failed to refresh auth tokens");
      }

      const html = await response.text();

      const csrf = extractCsrfFromHtml(html);
      if (!csrf) {
        throw AppError.authExpired("Could not extract CSRF token from page");
      }

      this.csrfToken = csrf;
      this.transport.updateAuth(csrf);

      const sid = extractSessionIdFromHtml(html);
      if (sid) {
        this.sessionId = sid;
        this.transport.updateAuth(csrf, sid);
      }

      // Update cache
      this.updateCachedTokens();
      return true;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError({
        code: "AUTH_EXPIRED",
        message: error instanceof Error ? error.message : "Auth refresh failed",
        retryable: false,
        suggestion: "Run 'save_auth_tokens' with fresh cookies from browser",
      });
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
    await this.ensureAuth();
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

export function getClient(): NotebookLMClient {
  if (!_client) {
    const cached = loadCachedTokens();
    if (!cached) {
      throw AppError.authMissing();
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
