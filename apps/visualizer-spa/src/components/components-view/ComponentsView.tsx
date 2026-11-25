/**
 * Вид «Компоненты»: галерея вариантов из states.ts проекта (как Storybook) —
 * узел на вариант, экран — страница компонента плагина SDK из трансляции.
 */
import { Background, ReactFlow, type Node, type NodeProps } from '@xyflow/react';
import { useEffect, useMemo } from 'react';
import { Empty, EmptyDescription } from '@/components/ui/empty';
import { useComponentsStore } from '../../store/components-store';
import { COMPONENT_LAYOUT, ComponentNode, type ComponentFlowNode } from './ComponentNode';
import { galleryLayout } from './gallery-layout';

type TitleFlowNode = Node<{ readonly title: string; readonly width: number }, 'title'>;

/** Заголовок колонки: приложение и папка. */
function TitleNode({ data }: NodeProps<TitleFlowNode>) {
  return (
    <div className="truncate text-sm font-medium text-muted-foreground" style={{ width: data.width }} data-testid="component-group-title">
      {data.title}
    </div>
  );
}

const NODE_TYPES = { component: ComponentNode, title: TitleNode };

/** JSON по адресу; не 2xx — ошибка с полем error ответа (или его текстом). */
async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    let message = text;
    try {
      const body: unknown = JSON.parse(text);
      const err = typeof body === 'object' && body !== null ? Reflect.get(body, 'error') : undefined;
      message = typeof err === 'string' ? err : text;
    } catch {
      message = text;
    }
    throw new Error(url + ': ' + message);
  }
  return res.json();
}

/** Вид «Компоненты». */
export function ComponentsView() {
  const status = useComponentsStore((s) => s.status);
  const error = useComponentsStore((s) => s.error);
  const gallery = useComponentsStore((s) => s.gallery);
  const load = useComponentsStore((s) => s.load);
  useEffect(() => {
    if (useComponentsStore.getState().status === 'idle') {
      void load(fetchJson);
    }
  }, [load]);
  const nodes = useMemo<(ComponentFlowNode | TitleFlowNode)[]>(
    () =>
      galleryLayout(gallery, { width: COMPONENT_LAYOUT.outerWidth, height: COMPONENT_LAYOUT.contentHeight + 64 }).map((p) =>
        p.kind === 'title'
          ? { id: p.id, type: 'title', position: { x: p.x, y: p.y }, data: { title: p.title, width: p.width }, draggable: false, selectable: false }
          : { id: p.id, type: 'component', position: { x: p.x, y: p.y }, data: { item: p.item }, draggable: false },
      ),
    [gallery],
  );
  if (status === 'error') {
    return (
      <Empty data-testid="components-error">
        <EmptyDescription>Галерея не загрузилась: {error}</EmptyDescription>
      </Empty>
    );
  }
  if (status === 'idle' || status === 'loading') {
    return (
      <Empty data-testid="components-loading">
        <EmptyDescription>Загружаю варианты компонентов проекта…</EmptyDescription>
      </Empty>
    );
  }
  if (nodes.length === 0) {
    return (
      <Empty data-testid="components-empty">
        <EmptyDescription>
          В .live-app-map/states.ts нет вариантов компонентов: добавьте export const components = {'{'} '&lt;файл&gt;#&lt;экспорт&gt;': [{'{'} id, label, props {'}'}] {'}'}.
          {gallery.problems.length > 0 ? ' Не показаны: ' + gallery.problems.join('; ') : ''}
        </EmptyDescription>
      </Empty>
    );
  }
  return (
    <div className="relative h-full w-full" data-testid="components-view">
      <ReactFlow nodes={nodes} edges={[]} nodeTypes={NODE_TYPES} fitView minZoom={0.1} maxZoom={2} proOptions={{ hideAttribution: true }} nodesConnectable={false}>
        <Background />
      </ReactFlow>
      {gallery.problems.length > 0 ? (
        <div className="absolute bottom-3 left-3 max-w-md rounded-md border bg-card p-2 text-xs text-muted-foreground" role="status" data-testid="components-problems">
          Не показаны: {gallery.problems.join('; ')}
        </div>
      ) : null}
    </div>
  );
}
