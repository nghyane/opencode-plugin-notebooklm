/**
 * Unified error handling
 */

export type ErrorCode = 
  | 'AUTH_EXPIRED'
  | 'AUTH_INVALID' 
  | 'AUTH_MISSING'
  | 'RATE_LIMITED'
  | 'SERVER_ERROR'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'RPC_ERROR'
  | 'PARSE_ERROR'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'UNKNOWN';

export interface AppErrorOptions {
  code: ErrorCode;
  message: string;
  cause?: Error;
  statusCode?: number;
  retryable?: boolean;
  suggestion?: string;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode?: number | undefined;
  readonly retryable: boolean;
  readonly suggestion?: string | undefined;
  
  constructor(options: AppErrorOptions) {
    super(options.message);
    this.name = 'AppError';
    this.code = options.code;
    this.statusCode = options.statusCode ?? undefined;
    this.retryable = options.retryable ?? false;
    this.suggestion = options.suggestion ?? undefined;
    
    if (options.cause) {
      this.cause = options.cause;
    }
  }
  
  toJSON(): Record<string, unknown> {
    return {
      error: true,
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      suggestion: this.suggestion,
      statusCode: this.statusCode,
    };
  }
  
  static fromStatus(status: number, message?: string): AppError {
    if (status === 401) {
      return new AppError({
        code: 'AUTH_EXPIRED',
        message: message || 'Authentication expired',
        statusCode: status,
        retryable: true,
        suggestion: 'Run save_auth_tokens with fresh cookies from browser',
      });
    }
    if (status === 403) {
      return new AppError({
        code: 'AUTH_INVALID',
        message: message || 'Access forbidden',
        statusCode: status,
        retryable: true,
        suggestion: 'Check if cookies are valid and have correct permissions',
      });
    }
    if (status === 429) {
      return new AppError({
        code: 'RATE_LIMITED',
        message: message || 'Rate limited by Google',
        statusCode: status,
        retryable: true,
        suggestion: 'Wait a few seconds and try again',
      });
    }
    if (status >= 500) {
      return new AppError({
        code: 'SERVER_ERROR',
        message: message || 'Google server error',
        statusCode: status,
        retryable: true,
        suggestion: 'Try again in a few seconds',
      });
    }
    return new AppError({
      code: 'UNKNOWN',
      message: message || `Request failed with status ${status}`,
      statusCode: status,
      retryable: false,
    });
  }
  
  static authMissing(): AppError {
    return new AppError({
      code: 'AUTH_MISSING',
      message: 'No authentication found',
      retryable: false,
      suggestion: "Run 'save_auth_tokens' to authenticate",
    });
  }
  
  static authExpired(message?: string): AppError {
    return new AppError({
      code: 'AUTH_EXPIRED',
      message: message || 'Authentication expired',
      retryable: false,
      suggestion: "Run 'save_auth_tokens' with fresh cookies from browser",
    });
  }
  
  static rpcError(code: number, message?: string): AppError {
    if (code === 16) {
      return new AppError({
        code: 'AUTH_EXPIRED',
        message: message || 'Authentication expired (RPC Error 16)',
        retryable: true,
        suggestion: "Run 'save_auth_tokens' with fresh cookies",
      });
    }
    return new AppError({
      code: 'RPC_ERROR',
      message: message || `RPC Error ${code}`,
      retryable: false,
    });
  }
  
  static notFound(what: string): AppError {
    return new AppError({
      code: 'NOT_FOUND',
      message: `${what} not found`,
      retryable: false,
    });
  }
  
  static validation(message: string): AppError {
    return new AppError({
      code: 'VALIDATION_ERROR',
      message,
      retryable: false,
    });
  }
}

/**
 * Check if error message indicates auth failure
 */
export function isAuthError(error: unknown): boolean {
  if (error instanceof AppError) {
    return error.code === 'AUTH_EXPIRED' || error.code === 'AUTH_INVALID';
  }
  if (error instanceof Error) {
    return error.message.includes('RPC Error 16') || 
           error.message.includes('Authentication expired');
  }
  return false;
}

/**
 * Wrap any error as AppError
 */
export function wrapError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  
  if (error instanceof Error) {
    // Check for auth errors in message
    if (isAuthError(error)) {
      return AppError.rpcError(16, error.message);
    }
    return new AppError({
      code: 'UNKNOWN',
      message: error.message,
      cause: error,
    });
  }
  
  return new AppError({
    code: 'UNKNOWN',
    message: String(error),
  });
}
