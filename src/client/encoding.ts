/**
 * Encoding utilities for Google batchexecute RPC
 * 
 * These functions match Python's json.dumps(ensure_ascii=True) and 
 * urllib.parse.quote(safe='') behaviors exactly, which is required
 * for Google's RPC endpoints.
 */

/**
 * JSON.stringify with ASCII-only output (matches Python json.dumps default)
 * Escapes all non-ASCII chars to \uXXXX format
 */
export function jsonStringifyAscii(data: unknown): string {
  return JSON.stringify(data).replace(/[\u007f-\uffff]/g, (c) => 
    '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4)
  );
}

/**
 * Strict URL encoding (matches Python urllib.parse.quote(safe=''))
 * Encodes additional chars that encodeURIComponent misses: !'()*
 */
export function strictEncode(str: string): string {
  return encodeURIComponent(str).replace(
    /[!'()*]/g, 
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase()
  );
}

/**
 * Build form body for batchexecute RPC
 */
export function buildRpcBody(rpcId: string, params: unknown, csrfToken?: string): string {
  const paramsJson = jsonStringifyAscii(params);
  const fReq = [[[rpcId, paramsJson, null, "generic"]]];
  const fReqJson = jsonStringifyAscii(fReq);

  const parts = [`f.req=${strictEncode(fReqJson)}`];
  if (csrfToken) {
    parts.push(`at=${strictEncode(csrfToken)}`);
  }

  return parts.join("&") + "&";
}

/**
 * Build form body for streaming query RPC
 */
export function buildQueryBody(queryParams: unknown, csrfToken: string): string {
  const paramsJson = jsonStringifyAscii(queryParams);
  const fReq = jsonStringifyAscii([null, paramsJson]);
  
  const parts = [
    `f.req=${strictEncode(fReq)}`,
    `at=${strictEncode(csrfToken)}`,
  ];
  
  return parts.join("&") + "&";
}

/**
 * Remove anti-XSSI prefix from response
 */
export function stripXssiPrefix(text: string): string {
  if (text.startsWith(")]}'")) {
    return text.slice(4);
  }
  return text;
}
