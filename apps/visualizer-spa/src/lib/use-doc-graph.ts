/**
 * Граф документации открытой карты (строится один раз на карту) и переход по узлу:
 * документ — в текст, объект карты — в его вид.
 */
import { useCallback, useMemo } from 'react';
import { buildCodeIndex, buildDocRefIndex } from '@live-app-map/graph';
import { useAppStore } from '../store/app-store';
import { useViewStore } from '../store/view-store';
import { buildDocGraph, type DocGraph, type GraphNode } from './doc-graph';
import { useMapNav } from './use-map-nav';

const EMPTY: DocGraph = { nodes: [], edges: [] };

/** Полный граф документации карты. */
export function useDocGraph(): DocGraph {
  const doc = useAppStore((s) => s.document);
  return useMemo(() => {
    if (doc?.docs === undefined) {
      return EMPTY;
    }
    return buildDocGraph(doc, buildDocRefIndex(doc, doc.code === undefined ? undefined : buildCodeIndex(doc)));
  }, [doc]);
}

/**
 * Открыть узел: документ или эпоху — текстом, роут, таблицу, экран — в их виде.
 *
 * @returns функция; false — узлу некуда вести (файл кода вне карты, сервис)
 */
export function useOpenGraphNode(): (node: GraphNode) => boolean {
  const openDoc = useViewStore((s) => s.openDoc);
  const nav = useMapNav();
  return useCallback(
    (node: GraphNode) => {
      if (node.docPath !== undefined) {
        openDoc(node.docPath);
        return true;
      }
      if (node.target !== undefined && node.target.kind !== 'file') {
        nav(node.target);
        return true;
      }
      return false;
    },
    [openDoc, nav],
  );
}
