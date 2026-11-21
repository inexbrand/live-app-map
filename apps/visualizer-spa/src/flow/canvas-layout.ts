/**
 * Раскладка холста: размеры нод (как в DOM) и упаковка по группам.
 * Одна функция и для холста, и для теста наложений.
 */
import type { AppMapDocument, AppMapEdge, AppMapNode, DeviceViewport } from '@live-app-map/schema';
import { computeNodeLayout, resolveNodeViewport } from '../lib/viewport';
import { packLayout, type LayoutBox, type PackedLayout } from './pack-layout';
import { SERVICE_NODE_SIZE } from './service-node-size';

/** Группа нод сервисов бэкенда. */
export const SERVICES_GROUP = 'services';
/** Группа экранов без группы в карте. */
export const OTHER_GROUP = 'other';
/** Наибольшая ширина ряда группы в мировых координатах. */
export const MAX_ROW_WIDTH = 4200;

/** Что влияет на размер нод. */
export type CanvasSizing = {
  readonly iframeScale: number;
  readonly nodeViewports: ReadonlyMap<string, DeviceViewport>;
  readonly contentHeights: ReadonlyMap<string, number>;
};

/**
 * Размер ноды на холсте (как у DOM PageNode / ServiceNode).
 *
 * @param doc - документ
 * @param n - нода
 * @param sizing - масштаб и размеры окон
 * @param selected - с полосой выбранной ноды
 */
export function canvasNodeSize(doc: AppMapDocument, n: AppMapNode, sizing: CanvasSizing, selected: boolean): { outerWidth: number; outerHeight: number } {
  if (n.kind === 'service') {
    return { outerWidth: SERVICE_NODE_SIZE.width, outerHeight: SERVICE_NODE_SIZE.height };
  }
  const vp = resolveNodeViewport({
    nodeViewport: n.viewport,
    override: sizing.nodeViewports.get(n.id),
    layout: doc.layout,
    measuredHeight: sizing.contentHeights.get(n.id),
  });
  return computeNodeLayout(vp, sizing.iframeScale, { selected });
}

/**
 * Раскладка: коробки нод (размер с полосой выбора — выбор не наезжает на
 * соседей) и упаковка по группам документа, сервисы — последней группой.
 *
 * @param doc - документ
 * @param nodes - ноды холста (после фильтра)
 * @param navEdges - рёбра холста
 * @param sizing - масштаб и размеры окон
 */
export function layoutCanvas(
  doc: AppMapDocument,
  nodes: readonly AppMapNode[],
  navEdges: readonly AppMapEdge[],
  sizing: CanvasSizing,
): { readonly boxes: LayoutBox[]; readonly packed: PackedLayout } {
  const boxes: LayoutBox[] = nodes.map((n) => {
    const s = canvasNodeSize(doc, n, sizing, true);
    return { id: n.id, width: s.outerWidth, height: s.outerHeight, group: n.kind === 'service' ? SERVICES_GROUP : n.groupIds?.[0] ?? OTHER_GROUP };
  });
  const groupTitles = new Map<string, string>([[OTHER_GROUP, 'Экраны'], ...(doc.groups ?? []).map((g): [string, string] => [g.id, g.title]), [SERVICES_GROUP, 'Сервисы бэкенда']]);
  // Экраны раньше сервисов: группы карты по order, затем экраны без группы, сервисы — последними.
  const groupOrder = [...[...(doc.groups ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((g) => g.id), OTHER_GROUP, SERVICES_GROUP];
  const packed = packLayout(
    boxes,
    navEdges.flatMap((e) => (e.to === null ? [] : [{ from: e.from, to: e.to }])),
    { groupOrder, groupTitles, maxRowWidth: MAX_ROW_WIDTH },
  );
  return { boxes, packed };
}