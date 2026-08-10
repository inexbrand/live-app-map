/**
 * Visualizer core utilities (без React Flow host — SPA в apps/visualizer-spa).
 */
export {
  DEFAULT_MAX_LIVE,
  DEFAULT_MAX_PINNED,
  liveDiff,
  reconcile,
  transitionSlot,
  type PolicyState,
  type ViewMode,
} from '@live-app-map/iframe-policy';

export {
  applyStateToUrl,
  indexDocument,
  neighbors,
  resolveNodeUrl,
  searchNodes,
} from '@live-app-map/graph';
