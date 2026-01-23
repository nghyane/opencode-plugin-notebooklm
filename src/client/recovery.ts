/**
 * Recovery layer - retry, backoff, error handling
 */

export interface RecoveryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  retryOn?: number[];
}

export interface StructuredError {
  error: true;
  code: string;
  message: string;
  retryable: boolean;
  suggestion?: string | undefined;
  statusCode?: number | undefined;
}

const DEFAULT_OPTIONS: Required<RecoveryOptions> = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 10000,
  retryOn: [429, 500, 502, 503, 504],
};

/**
 * Exponential backoff with jitter
 */
export function calculateBackoff(attempt: number, baseDelay: number, maxDelay: number): number {
  const exponential = baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * 0.3 * exponential;
  return Math.min(exponential + jitter, maxDelay);
}

/**
 * Sleep utility
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if error is retryable
 */
export function isRetryable(statusCode: number, retryOn: number[]): boolean {
  return retryOn.includes(statusCode);
}

/**
 * Check if auth error
 */
export function isAuthError(statusCode: number): boolean {
  return statusCode === 401 || statusCode === 403;
}

/**
 * Create structured error
 */
export function createError(
  code: string,
  message: string,
  retryable: boolean,
  statusCode?: number,
  suggestion?: string
): StructuredError {
  return {
    error: true,
    code,
    message,
    retryable,
    statusCode,
    suggestion,
  };
}

/**
 * Error codes
 */
export const ErrorCodes = {
  AUTH_EXPIRED: 'AUTH_EXPIRED',
  AUTH_INVALID: 'AUTH_INVALID',
  RATE_LIMITED: 'RATE_LIMITED',
  SERVER_ERROR: 'SERVER_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT: 'TIMEOUT',
  UNKNOWN: 'UNKNOWN',
} as const;

/**
 * Map status code to error
 */
export function statusToError(statusCode: number, message?: string): StructuredError {
  if (statusCode === 401) {
    return createError(
      ErrorCodes.AUTH_EXPIRED,
      message || 'Authentication expired',
      true,
      statusCode,
      'Run save_auth_tokens with fresh cookies from browser'
    );
  }
  if (statusCode === 403) {
    return createError(
      ErrorCodes.AUTH_INVALID,
      message || 'Access forbidden',
      true,
      statusCode,
      'Check if cookies are valid and have correct permissions'
    );
  }
  if (statusCode === 429) {
    return createError(
      ErrorCodes.RATE_LIMITED,
      message || 'Rate limited by Google',
      true,
      statusCode,
      'Wait a few seconds and try again'
    );
  }
  if (statusCode >= 500) {
    return createError(
      ErrorCodes.SERVER_ERROR,
      message || 'Google server error',
      true,
      statusCode,
      'Try again in a few seconds'
    );
  }
  return createError(
    ErrorCodes.UNKNOWN,
    message || `Request failed with status ${statusCode}`,
    false,
    statusCode
  );
}

/**
 * Check if error message indicates auth failure
 */
export function isAuthErrorMessage(message: string): boolean {
  return message.includes('RPC Error 16') || 
         message.includes('Authentication expired') ||
         message.includes('auth');
}

/**
 * Wrapper for fetch with retry logic
 */
export async function fetchWithRecovery<T>(
  fetchFn: () => Promise<Response>,
  parseFn: (res: Response) => Promise<T>,
  onAuthError?: () => Promise<boolean>,
  options: RecoveryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error | null = null;
  let authRetried = false;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      const response = await fetchFn();

      // Auth error from HTTP status - try refresh once
      if (isAuthError(response.status) && onAuthError && !authRetried) {
        authRetried = true;
        const refreshed = await onAuthError();
        if (refreshed) {
          // Retry immediately after auth refresh
          continue;
        }
        throw statusToError(response.status);
      }

      // Retryable error
      if (!response.ok && isRetryable(response.status, opts.retryOn)) {
        if (attempt < opts.maxRetries) {
          const delay = calculateBackoff(attempt, opts.baseDelay, opts.maxDelay);
          await sleep(delay);
          continue;
        }
        throw statusToError(response.status);
      }

      // Non-retryable error
      if (!response.ok) {
        throw statusToError(response.status);
      }

      // Success - parse response
      try {
        return await parseFn(response);
      } catch (parseErr) {
        // Check if parse error is auth-related (RPC Error 16)
        const errMsg = parseErr instanceof Error ? parseErr.message : String(parseErr);
        if (isAuthErrorMessage(errMsg) && onAuthError && !authRetried) {
          authRetried = true;
          const refreshed = await onAuthError();
          if (refreshed) {
            continue; // Retry with fresh auth
          }
        }
        throw parseErr;
      }
    } catch (err) {
      lastError = err as Error;
      
      // If it's already a structured error, don't wrap it
      if ((err as StructuredError).error === true) {
        throw err;
      }

      // Check if error is auth-related (RPC Error 16)
      const errMsg = err instanceof Error ? err.message : String(err);
      if (isAuthErrorMessage(errMsg) && onAuthError && !authRetried) {
        authRetried = true;
        const refreshed = await onAuthError();
        if (refreshed) {
          continue; // Retry with fresh auth
        }
        throw createError(
          ErrorCodes.AUTH_EXPIRED,
          errMsg,
          true,
          undefined,
          'Run save_auth_tokens with fresh cookies from browser'
        );
      }

      // Network/timeout errors - retry
      if (attempt < opts.maxRetries) {
        const delay = calculateBackoff(attempt, opts.baseDelay, opts.maxDelay);
        await sleep(delay);
        continue;
      }
    }
  }

  // All retries exhausted
  throw createError(
    ErrorCodes.NETWORK_ERROR,
    lastError?.message || 'Request failed after retries',
    false
  );
}
