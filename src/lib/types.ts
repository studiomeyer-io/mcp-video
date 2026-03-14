/**
 * Shared types for MCP tool handlers
 */

export interface ToolResponse {
  [key: string]: unknown;
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- MCP SDK passes raw JSON; validation is via tool schemas
export type ToolHandler = (args: any) => ToolResponse | Promise<ToolResponse>;

/** Helper to wrap a JSON result into a ToolResponse */
export function jsonResponse(result: unknown, isError?: boolean): ToolResponse {
  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    ...(isError !== undefined ? { isError } : {}),
  };
}

/** Helper to create an error ToolResponse with structured error code */
export function errorResponse(message: string, code?: string): ToolResponse {
  return jsonResponse({ error: message, code: code ?? 'INTERNAL_ERROR' }, true);
}
