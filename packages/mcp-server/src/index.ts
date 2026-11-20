/**
 * Публичный API `@live-app-map/mcp-server`: ядро MCP для stdio и HTTP.
 */
export {
  MAX_SNAPSHOT_BYTES,
  SNAPSHOT_REQUEST_TTL_MS,
  readLatestSnapshot,
  readPendingSnapshotRequest,
  readVisualizerState,
  saveSnapshot,
  snapshotUploadSchema,
  visualizerStateSchema,
  writeSnapshotRequest,
  writeVisualizerState,
} from './agent-state';
export type {
  SnapshotRecord,
  SnapshotRequest,
  SnapshotUpload,
  VisualizerState,
} from './agent-state';
export { LAM_DIR_ENV, LAM_DIR_NAME, resolveLamDir } from './lam-dir';
export { MCP_PROTOCOL_VERSION, RpcErrorCode, handleRpcMessage, handleRpcText, rpcError } from './rpc';
export type { RpcResponse } from './rpc';
export { TOOLS, callTool } from './tools';
export type { ToolContext, ToolDef, ToolResult } from './tools';
