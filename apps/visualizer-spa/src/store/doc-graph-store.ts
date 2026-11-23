/**
 * Состояние графа документации: раскрытые эпохи, фильтры, выбор, запрос.
 * Отдельный store, чтобы переход «граф → текст → граф» не сбрасывал настройку.
 */
import { create } from 'zustand';
import type { EpochReadiness } from '@live-app-map/schema';
import type { GraphNodeKind } from '../lib/doc-graph';

/**
 * Типы по умолчанию — документы: эпохи (их файлы — по раскрытию эпохи), заметки, руководства.
 * Со всеми типами граф korbor — 544 узла, и эпохи теряются среди файлов кода, роутов и таблиц.
 * Остальные включаются в «Типах узлов» или «показать все».
 */
export const DEFAULT_GRAPH_KINDS: ReadonlySet<GraphNodeKind> = new Set<GraphNodeKind>(['epoch', 'epoch-file', 'note', 'guide']);

type DocGraphState = {
  readonly expanded: ReadonlySet<string>;
  /** Видимые типы; пусто — все. Сначала — DEFAULT_GRAPH_KINDS. */
  readonly kinds: ReadonlySet<GraphNodeKind>;
  readonly readiness: EpochReadiness | null;
  readonly selected: string | null;
  readonly query: string;
  /** Глубина локального графа у текста. */
  readonly localDepth: 1 | 2;
  readonly toggleEpoch: (epochId: string) => void;
  readonly expandAll: (epochIds: readonly string[]) => void;
  readonly collapseAll: () => void;
  readonly toggleKind: (kind: GraphNodeKind) => void;
  readonly resetKinds: () => void;
  readonly setReadiness: (r: EpochReadiness | null) => void;
  readonly select: (id: string | null) => void;
  readonly setQuery: (q: string) => void;
  readonly setLocalDepth: (d: 1 | 2) => void;
};

/** Store графа документации. */
export const useDocGraphStore = create<DocGraphState>((set) => ({
  expanded: new Set(),
  kinds: DEFAULT_GRAPH_KINDS,
  readiness: null,
  selected: null,
  query: '',
  localDepth: 1,
  toggleEpoch: (id) =>
    set((s) => {
      const next = new Set(s.expanded);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return { expanded: next };
    }),
  expandAll: (ids) => set({ expanded: new Set(ids) }),
  collapseAll: () => set({ expanded: new Set() }),
  toggleKind: (kind) =>
    set((s) => {
      const next = new Set(s.kinds);
      if (next.has(kind)) {
        next.delete(kind);
      } else {
        next.add(kind);
      }
      return { kinds: next };
    }),
  resetKinds: () => set({ kinds: new Set() }),
  setReadiness: (readiness) => set({ readiness }),
  select: (selected) => set({ selected }),
  setQuery: (query) => set({ query }),
  setLocalDepth: (localDepth) => set({ localDepth }),
}));