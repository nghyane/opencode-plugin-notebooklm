/**
 * RPC Transport Layer
 * Handles HTTP communication with Google's batchexecute endpoint
 */

import { Config } from "../config";
import { AppError, isAuthError, wrapError } from "../errors";
import { buildRpcBody, buildQueryBody, stripXssiPrefix, strictEncode } from "./encoding";
import { cookiesToHeader } from "../auth/tokens";

export interface TransportOptions {
  cookies: Record<string, string>;
  csrfToken: string;
  sessionId: string;
  onAuthRefresh?: () => Promise<boolean>;
}

export interface RpcResponse {
  raw: unknown[];
  text: string;
}

/**
 * RPC Transport - handles low-level HTTP communication
 */
export class RpcTransport {
  private cookies: Record<string, string>;
  private csrfToken: string;
  private sessionId: string;
  private onAuthRefresh?: (() => Promise<boolean>) | undefined;
  private reqidCounter: number;

  constructor(options: TransportOptions) {
    this.cookies = options.cookies;
    this.csrfToken = options.csrfToken;
    this.sessionId = options.sessionId;
    this.onAuthRefresh = options.onAuthRefresh;
    this.reqidCounter = Math.floor(Math.random() * 900000) + 100000;
  }

  /**
   * Update auth tokens (after refresh)
   */
  updateAuth(csrfToken: string, sessionId?: string): void {
    this.csrfToken = csrfToken;
    if (sessionId) {
      this.sessionId = sessionId;
    }
  }

  /**
   * Get common headers
   */
  private getHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      Origin: Config.BASE_URL,
      Referer: `${Config.BASE_URL}/`,
      Cookie: cookiesToHeader(this.cookies),
      "X-Same-Domain": "1",
      "User-Agent": Config.USER_AGENT,
    };
  }

  /**
   * Build batchexecute URL
   */
  private buildUrl(rpcId: string, sourcePath = "/"): string {
    const params = new URLSearchParams({
      rpcids: rpcId,
      "source-path": sourcePath,
      bl: Config.BL,
      hl: "en",
      rt: "c",
    });

    if (this.sessionId) {
      params.set("f.sid", this.sessionId);
    }

    return `${Config.BATCHEXECUTE_URL}?${params.toString()}`;
  }

  /**
   * Parse batchexecute response
   */
  private parseResponse(responseText: string): unknown[] {
    const text = stripXssiPrefix(responseText);
    const lines = text.trim().split("\n");
    const results: unknown[] = [];

    let i = 0;
    while (i < lines.length) {
      const line = lines[i]?.trim() ?? '';
      if (!line) {
        i++;
        continue;
      }

      const byteCount = parseInt(line, 10);
      if (!isNaN(byteCount)) {
        i++;
        if (i < lines.length) {
          try {
            results.push(JSON.parse(lines[i] ?? ''));
          } catch {
            // Skip invalid JSON
          }
        }
        i++;
      } else {
        try {
          results.push(JSON.parse(line));
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
  private extractResult(parsed: unknown[], rpcId: string): unknown {
    for (const chunk of parsed) {
      if (!Array.isArray(chunk)) continue;

      for (const item of chunk) {
        if (!Array.isArray(item) || item.length < 3) continue;

        if (item[0] === "wrb.fr" && item[1] === rpcId) {
          // Check for RPC error
          if (
            item.length > 6 &&
            item[6] === "generic" &&
            Array.isArray(item[5])
          ) {
            const errorCode = item[5].find((c: unknown) => typeof c === "number");
            if (errorCode) {
              throw AppError.rpcError(errorCode);
            }
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
   * Execute RPC call with retry and auth refresh
   */
  async call(
    rpcId: string,
    params: unknown,
    options: {
      path?: string;
      timeout?: number;
    } = {}
  ): Promise<unknown> {
    const { path = "/", timeout = Config.DEFAULT_TIMEOUT } = options;
    
    const body = buildRpcBody(rpcId, params, this.csrfToken);
    const url = this.buildUrl(rpcId, path);
    const headers = this.getHeaders();

    let authRetried = false;
    const maxRetries = 3;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers,
          body,
          signal: AbortSignal.timeout(timeout),
        });

        // Auth error - try refresh once
        if ((response.status === 401 || response.status === 403) && !authRetried && this.onAuthRefresh) {
          authRetried = true;
          const refreshed = await this.onAuthRefresh();
          if (refreshed) continue;
          throw AppError.fromStatus(response.status);
        }

        // Retryable server error
        if (response.status >= 500 && attempt < maxRetries) {
          const delay = 1000 * Math.pow(2, attempt);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }

        if (!response.ok) {
          throw AppError.fromStatus(response.status);
        }

        const text = await response.text();
        const parsed = this.parseResponse(text);
        
        try {
          return this.extractResult(parsed, rpcId);
        } catch (e) {
          // Check for auth error in RPC response
          if (isAuthError(e) && !authRetried && this.onAuthRefresh) {
            authRetried = true;
            const refreshed = await this.onAuthRefresh();
            if (refreshed) continue;
          }
          throw e;
        }
      } catch (e) {
        if (e instanceof AppError) throw e;
        
        // Network/timeout error - retry
        if (attempt < maxRetries) {
          const delay = 1000 * Math.pow(2, attempt);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        
        throw wrapError(e);
      }
    }

    throw new AppError({
      code: 'NETWORK_ERROR',
      message: 'Request failed after retries',
      retryable: false,
    });
  }

  /**
   * Execute streaming query (different endpoint format)
   */
  async streamQuery(
    queryParams: unknown,
    notebookId: string,
    timeout: number = Config.QUERY_TIMEOUT
  ): Promise<string> {
    this.reqidCounter += 100000;
    const reqId = this.reqidCounter;

    const body = buildQueryBody(queryParams, this.csrfToken);

    const urlParams = new URLSearchParams({
      bl: Config.BL,
      hl: "en",
      _reqid: String(reqId),
      rt: "c",
    });
    if (this.sessionId) {
      urlParams.set("f.sid", this.sessionId);
    }

    const headers = {
      ...this.getHeaders(),
      ...Config.RPC_HEADERS,
    };

    const response = await fetch(
      `${Config.BASE_URL}${Config.QUERY_ENDPOINT}?${urlParams.toString()}`,
      {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(timeout),
      }
    );

    if (!response.ok) {
      const text = await response.text();
      throw new AppError({
        code: 'RPC_ERROR',
        message: `Query failed: HTTP ${response.status} - ${text}`,
        statusCode: response.status,
        retryable: response.status >= 500,
      });
    }

    return response.text();
  }
}
