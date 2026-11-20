/**
 * JSON-RPC 2.0 обработчик MCP (initialize, tools/list, tools/call, ping).
 * Транспорт (stdio, HTTP) отдельно; здесь только сообщение → ответ.
 */
import { TOOLS, callTool, type ToolContext } from './tools';

/** Версия протокола MCP, которую отдаёт initialize. */
export const MCP_PROTOCOL_VERSION = '2024-11-05';

/** Ответ JSON-RPC. */
export type RpcResponse =
  | { readonly jsonrpc: '2.0'; readonly id: string | number | null; readonly result: unknown }
  | {
      readonly jsonrpc: '2.0';
      readonly id: string | number | null;
      readonly error: { readonly code: number; readonly message: string };
    };

/** Коды ошибок JSON-RPC. */
export enum RpcErrorCode {
  PARSE_ERROR = -32700,
  INVALID_REQUEST = -32600,
  METHOD_NOT_FOUND = -32601,
}

type RpcId = string | number | null;

function asRecord(v: unknown): Readonly<Record<string, unknown>> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
    ? Object.fromEntries(Object.entries(v))
    : null;
}

function idOf(msg: Readonly<Record<string, unknown>>): RpcId | undefined {
  const id = msg['id'];
  if (id === undefined) {
    return undefined;
  }
  return typeof id === 'string' || typeof id === 'number' ? id : null;
}

/**
 * Ошибка JSON-RPC.
 *
 * @param id - id запроса (null, если не разобран)
 * @param code - код
 * @param message - текст
 */
export function rpcError(id: RpcId, code: RpcErrorCode, message: string): RpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

function dispatch(method: string, params: Readonly<Record<string, unknown>>, ctx: ToolContext): unknown {
  if (method === 'initialize') {
    return {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: 'live-app-map-mcp', version: '0.1.0' },
    };
  }
  if (method === 'tools/list') {
    return { tools: TOOLS };
  }
  if (method === 'tools/call') {
    const name = typeof params['name'] === 'string' ? params['name'] : '';
    return callTool(name, asRecord(params['arguments']) ?? {}, ctx);
  }
  if (method === 'ping') {
    return {};
  }
  return undefined;
}

/**
 * Обрабатывает одно разобранное JSON-RPC сообщение.
 * Уведомление (без id) не получает ответа — возвращается null.
 *
 * @param message - разобранный JSON
 * @param ctx - окружение tools
 */
export function handleRpcMessage(message: unknown, ctx: ToolContext): RpcResponse | null {
  const msg = asRecord(message);
  if (msg === null || typeof msg['method'] !== 'string') {
    return rpcError(null, RpcErrorCode.INVALID_REQUEST, 'invalid request');
  }
  const id = idOf(msg);
  const result = dispatch(msg['method'], asRecord(msg['params']) ?? {}, ctx);
  if (id === undefined) {
    return null;
  }
  if (result === undefined) {
    return rpcError(id, RpcErrorCode.METHOD_NOT_FOUND, `method not found: ${msg['method']}`);
  }
  return { jsonrpc: '2.0', id, result };
}

/**
 * Строка JSON → ответ (ошибка разбора тоже ответ).
 *
 * @param line - одна строка / тело запроса
 * @param ctx - окружение tools
 */
export function handleRpcText(line: string, ctx: ToolContext): RpcResponse | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return rpcError(null, RpcErrorCode.PARSE_ERROR, 'parse error');
  }
  return handleRpcMessage(parsed, ctx);
}
