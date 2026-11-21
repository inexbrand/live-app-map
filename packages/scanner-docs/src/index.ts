/**
 * Публичный API `@live-app-map/scanner-docs`: документация проекта для раздела `docs` карты.
 */
export { readEpoch, scanDocs } from './scan-docs';
export { briefSummary, declaredStatus, firstHeading, openBugItems } from './markdown-text';
export { bugItems, setBugItemState, type BugItem, type BugItemState, type SetBugResult } from './bug-items';
