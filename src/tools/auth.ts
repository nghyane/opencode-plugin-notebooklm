/**
 * Auth Tools v2
 * 
 * Only save_auth_tokens - refresh_auth is now a hook
 */

import { resetClient } from "../client/api";
import {
  saveTokensToCache,
  parseCookieHeader,
  validateCookies,
} from "../auth/tokens";
import type { ToolResult, AuthTokens } from "../types";

// ============================================================================
// save_auth_tokens
// ============================================================================

export async function save_auth_tokens(args: {
  cookies: string;
  csrf_token?: string;
  session_id?: string;
}): Promise<ToolResult> {
  try {
    const cookies = parseCookieHeader(args.cookies);

    if (!validateCookies(cookies)) {
      return {
        status: "error",
        error: "Missing required cookies: SID, HSID, SSID, APISID, SAPISID",
      };
    }

    const tokens: AuthTokens = {
      cookies,
      csrfToken: args.csrf_token || "",
      sessionId: args.session_id || "",
      extractedAt: Date.now() / 1000,
    };

    saveTokensToCache(tokens);
    resetClient();

    return {
      status: "success",
      message: "Auth tokens saved. CSRF will auto-refresh on first API call.",
    };
  } catch (e) {
    return { status: "error", error: String(e) };
  }
}
