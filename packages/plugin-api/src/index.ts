/**
 * Контракты плагинов Live App Map.
 */
import type { AppMapDocument, AppMapEdge, AppMapNode } from '@live-app-map/schema';

export type ScanContext = {
  readonly projectRoot: string;
  readonly appRoot: string;
  readonly document: AppMapDocument;
};

export type VisualizerPluginApi = {
  readonly addToolbarButton: (opts: {
    readonly id: string;
    readonly label: string;
    readonly onClick: () => void;
  }) => void;
};

export type LiveAppMapPlugin = {
  readonly name: string;
  readonly version?: string;
  contributeNodes?(ctx: ScanContext): Promise<AppMapNode[]> | AppMapNode[];
  contributeEdges?(ctx: ScanContext): Promise<AppMapEdge[]> | AppMapEdge[];
  transformDocument?(
    doc: AppMapDocument,
    ctx: ScanContext,
  ): AppMapDocument | Promise<AppMapDocument>;
  visualizer?(api: VisualizerPluginApi): void;
};

/**
 * Последовательно применяет плагины к документу карты.
 *
 * Для каждого плагина (в порядке массива):
 * 1. `contributeNodes` / `contributeEdges` — дописывают узлы и рёбра к текущему документу;
 * 2. `transformDocument` — получает уже объединённый документ и может заменить его целиком.
 *
 * Пустой список плагинов возвращает тот же объект документа (identity).
 * Хуки `visualizer` здесь не вызываются — их подключает SPA visualizer.
 *
 * @param doc — исходный AppMapDocument
 * @param plugins — упорядоченный список LiveAppMapPlugin
 * @param ctx — корень проекта и приложения (без `document`; подставляется на каждом шаге)
 * @returns документ после всех contribute/transform
 */
export async function applyPlugins(
  doc: AppMapDocument,
  plugins: readonly LiveAppMapPlugin[],
  ctx: Omit<ScanContext, 'document'>,
): Promise<AppMapDocument> {
  let current = doc;
  for (const plugin of plugins) {
    const fullCtx: ScanContext = { ...ctx, document: current };
    const extraNodes = plugin.contributeNodes
      ? await plugin.contributeNodes(fullCtx)
      : [];
    const extraEdges = plugin.contributeEdges
      ? await plugin.contributeEdges(fullCtx)
      : [];
    if (extraNodes.length || extraEdges.length) {
      current = {
        ...current,
        nodes: [...current.nodes, ...extraNodes],
        edges: [...current.edges, ...extraEdges],
      };
    }
    if (plugin.transformDocument) {
      current = await plugin.transformDocument(current, {
        ...ctx,
        document: current,
      });
    }
  }
  return current;
}
