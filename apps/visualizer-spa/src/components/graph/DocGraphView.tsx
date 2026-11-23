/**
 * Документация графом: фильтры по типу и готовности, поиск, раскрытие эпох по клику,
 * карточка выбранного узла со связями и переходами в текст и на карту.
 */
import { useMemo, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, FileText, MapPin } from 'lucide-react';
import type { EpochReadiness } from '@live-app-map/schema';
import { NODE_KIND_LABELS, NODE_KIND_SINGULAR, type DocGraph, type GraphNode, type GraphNodeKind } from '../../lib/doc-graph';
import { shownReadiness } from '../../lib/docs-view-model';
import { collapseEpochs, filterGraph, graphNeighbors, searchGraph } from '../../lib/doc-graph-query';
import { useDocGraph, useOpenGraphNode } from '../../lib/use-doc-graph';
import { useDocGraphStore } from '../../store/doc-graph-store';
import { DocGraphCanvas } from './DocGraphCanvas';
import { KindMark } from './KindMark';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Toggle } from '@/components/ui/toggle';

const READINESS: readonly { value: EpochReadiness | null; label: string }[] = [
  { value: null, label: 'Все' },
  { value: 'not-ready', label: 'Не готово' },
  { value: 'ready', label: 'Готово' },
];

const KINDS = [...NODE_KIND_LABELS.keys()];

/** Видимый граф: свёртка эпох → фильтр. */
function useVisibleGraph(full: DocGraph): DocGraph {
  const expanded = useDocGraphStore((s) => s.expanded);
  const kinds = useDocGraphStore((s) => s.kinds);
  const readiness = useDocGraphStore((s) => s.readiness);
  return useMemo(() => filterGraph(collapseEpochs(full, expanded), { kinds, readiness }), [full, expanded, kinds, readiness]);
}

/** Store графа документации целиком. */
type GraphStore = ReturnType<typeof useDocGraphStore.getState>;

/** Соседи узла по типам в порядке легенды. */
function neighborsByKind(graph: DocGraph, id: string): [GraphNodeKind, GraphNode[]][] {
  const ids = graphNeighbors(graph, id);
  const byKind = new Map<GraphNodeKind, GraphNode[]>();
  for (const n of graph.nodes.filter((x) => ids.has(x.id))) {
    byKind.set(n.kind, [...(byKind.get(n.kind) ?? []), n]);
  }
  return [...byKind.entries()].sort((a, b) => KINDS.indexOf(a[0]) - KINDS.indexOf(b[0]));
}

/** Готовность эпохи словами (после типа узла). */
function readinessNote(node: GraphNode): string {
  if (node.kind !== 'epoch' || node.readiness === undefined) {
    return '';
  }
  return ` · ${node.readiness === 'not-ready' ? 'не готово' : node.readiness === 'ready' ? 'готово' : 'нет 09-bugs'}`;
}

/** Кнопка раскрытия файлов эпохи. */
function EpochFilesToggle(props: { readonly epochId: string }) {
  const expanded = useDocGraphStore((s) => s.expanded).has(props.epochId);
  const toggleEpoch = useDocGraphStore((s) => s.toggleEpoch);
  return (
    <Button type="button" size="sm" variant="outline" onClick={() => toggleEpoch(props.epochId)}>
      {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      {expanded ? 'Свернуть файлы' : 'Показать файлы'}
    </Button>
  );
}

/** Переходы из карточки: в текст, на карту, файлы эпохи. */
function CardActions(props: { readonly node: GraphNode }) {
  const { node } = props;
  const open = useOpenGraphNode();
  const canMap = node.target !== undefined && node.target.kind !== 'file';
  return (
    <div className="doc-graph__actions">
      {node.docPath === undefined ? null : (
        <Button type="button" size="sm" variant="default" onClick={() => open(node)} data-testid="graph-open-text">
          <FileText size={16} strokeWidth={1.75} /> Открыть текст
        </Button>
      )}
      {canMap ? (
        <Button type="button" size="sm" variant="default" onClick={() => open(node)} data-testid="graph-open-map">
          <MapPin size={16} strokeWidth={1.75} /> Показать на карте
        </Button>
      ) : null}
      {node.kind === 'epoch' && node.epochId !== undefined ? <EpochFilesToggle epochId={node.epochId} /> : null}
    </div>
  );
}

/** Ссылка на узел в списке: выбрать его на графе. */
function NodeLink(props: { readonly node: GraphNode; readonly on?: boolean; readonly testId?: string }) {
  const select = useDocGraphStore((s) => s.select);
  const n = props.node;
  return (
    <li>
      <button type="button" className={`doc-graph__link${props.on === true ? ' doc-graph__link--on' : ''}`} onClick={() => select(n.id)} data-testid={props.testId} title={n.detail}>
        <KindMark kind={n.kind} />
        <span>{n.label}</span>
      </button>
    </li>
  );
}

/** Связи узла одного типа (первые 40). */
function LinkGroup(props: { readonly kind: GraphNodeKind; readonly nodes: readonly GraphNode[] }) {
  const ns = props.nodes;
  return (
    <div className="doc-graph__group">
      <p className="doc-graph__group-title">
        {NODE_KIND_LABELS.get(props.kind)} <span className="docs-count">{ns.length}</span>
      </p>
      <ul>
        {ns.slice(0, 40).map((n) => (
          <NodeLink key={n.id} node={n} />
        ))}
      </ul>
      {ns.length > 40 ? <p className="docs-empty">и ещё {ns.length - 40}</p> : null}
    </div>
  );
}

/** Карточка выбранного узла. */
function NodeCard(props: { readonly graph: DocGraph; readonly node: GraphNode }) {
  const { graph, node } = props;
  const neighbors = useMemo(() => neighborsByKind(graph, node.id), [graph, node.id]);
  return (
    <aside className="doc-graph__card" data-testid="graph-node-card">
      <p className="doc-graph__kind">
        <KindMark kind={node.kind} /> {NODE_KIND_SINGULAR.get(node.kind) ?? node.kind}
        {readinessNote(node)}
      </p>
      <h2>{node.label}</h2>
      {node.detail === '' || node.detail === node.label ? null : <p className="doc-graph__detail">{node.detail}</p>}
      <CardActions node={node} />
      <section className="doc-graph__links">
        <h3>
          Связи <span className="docs-count">{neighbors.reduce((s, [, ns]) => s + ns.length, 0)}</span>
        </h3>
        {neighbors.length === 0 ? <p className="docs-empty">Связей нет.</p> : null}
        {neighbors.map(([kind, ns]) => (
          <LinkGroup key={kind} kind={kind} nodes={ns} />
        ))}
      </section>
    </aside>
  );
}

/** Поиск по графу: Enter выбирает первое совпадение. */
function GraphSearch(props: { readonly visible: DocGraph; readonly matches: ReadonlySet<string>; readonly st: GraphStore }) {
  const { visible, matches, st } = props;
  const hits = useMemo(() => visible.nodes.filter((n) => matches.has(n.id)).slice(0, 30), [visible, matches]);
  return (
    <>
      <Input
        id="graph-search"
        aria-label="Поиск по графу"
        value={st.query}
        placeholder="Узел: эпоха, роут, таблица, файл"
        onChange={(e) => st.setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && hits[0] !== undefined) {
            st.select(hits[0].id);
          }
        }}
      />
      {st.query.trim() === '' ? null : (
        <section className="docs-group">
          <h3 className="docs-group__title">
            Найдено <span className="docs-count">{matches.size}</span>
          </h3>
          {hits.length === 0 ? <p className="docs-empty">Ничего не найдено. Проверьте фильтры типов.</p> : null}
          <ul>
            {hits.map((n) => (
              <NodeLink key={n.id} node={n} on={n.id === st.selected} testId="graph-hit" />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

/** Фильтр готовности эпох. */
function ReadinessSection(props: { readonly full: DocGraph; readonly st: GraphStore }) {
  const { st } = props;
  const notReady = props.full.nodes.filter((n) => n.kind === 'epoch' && n.readiness === 'not-ready').length;
  return (
    <section className="docs-group">
      <h3 className="docs-group__title">Готовность эпох</h3>
      <div className="docs-list__filters" role="group" aria-label="Готовность эпох на графе">
        {shownReadiness(READINESS, notReady).map((r) => (
          <Toggle variant="outline" size="sm" key={r.label} pressed={st.readiness === r.value} onClick={() => st.setReadiness(r.value)}>
            {r.label}
            {r.value === 'not-ready' ? <span className="docs-count"> {notReady}</span> : null}
          </Toggle>
        ))}
      </div>
    </section>
  );
}

/** Сколько узлов каждого типа. */
function kindCounts(full: DocGraph): Map<GraphNodeKind, number> {
  const c = new Map<GraphNodeKind, number>();
  full.nodes.forEach((n) => c.set(n.kind, (c.get(n.kind) ?? 0) + 1));
  return c;
}

/** Фильтр по типам узлов (только типы, что есть в графе). */
function KindsSection(props: { readonly full: DocGraph; readonly st: GraphStore }) {
  const { st } = props;
  const counts = useMemo(() => kindCounts(props.full), [props.full]);
  return (
    <section className="docs-group">
      <h3 className="docs-group__title">
        Типы узлов
        {st.kinds.size === 0 ? null : (
          <button type="button" className="doc-graph__reset" onClick={st.resetKinds}>
            показать все
          </button>
        )}
      </h3>
      <ul className="doc-graph__kinds" role="group" aria-label="Типы узлов">
        {KINDS.filter((k) => (counts.get(k) ?? 0) > 0).map((k) => (
          <li key={k}>
            <button type="button" className={`doc-graph__kind-row${st.kinds.size === 0 || st.kinds.has(k) ? '' : ' doc-graph__kind-row--off'}`} aria-pressed={st.kinds.has(k)} onClick={() => st.toggleKind(k)} data-testid={`graph-kind-${k}`}>
              <KindMark kind={k} />
              <span>{NODE_KIND_LABELS.get(k)}</span>
              <span className="docs-count">{counts.get(k)}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Раскрыть или свернуть файлы всех эпох. */
function EpochsSection(props: { readonly full: DocGraph; readonly st: GraphStore }) {
  const { st } = props;
  const epochIds = useMemo(() => props.full.nodes.flatMap((n) => (n.kind === 'epoch' && n.epochId !== undefined ? [n.epochId] : [])), [props.full]);
  return (
    <section className="docs-group">
      <h3 className="docs-group__title">Эпохи</h3>
      <div className="doc-graph__actions">
        <Button type="button" size="sm" variant="outline" onClick={() => st.expandAll(epochIds)} data-testid="graph-expand-all">
          Раскрыть все
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={st.collapseAll} disabled={st.expanded.size === 0}>
          Свернуть
        </Button>
      </div>
      <p className="docs-empty">Клик по эпохе показывает её файлы, двойной клик по узлу открывает его.</p>
    </section>
  );
}

/** Выбор узла на холсте; клик по эпохе раскрывает её файлы (повторный — сворачивает). */
function selectOnCanvas(st: GraphStore, visible: DocGraph, id: string | null): void {
  const n = id === null ? undefined : visible.nodes.find((x) => x.id === id);
  if (n?.kind === 'epoch' && n.epochId !== undefined && (st.selected === n.id || !st.expanded.has(n.epochId))) {
    st.toggleEpoch(n.epochId);
  }
  st.select(id);
}

/** Холст или подсказка, что под фильтры ничего не попало. */
function GraphStage(props: { readonly visible: DocGraph; readonly matches: ReadonlySet<string>; readonly selected: GraphNode | undefined; readonly st: GraphStore }) {
  const { visible } = props;
  const open = useOpenGraphNode();
  return (
    <div className="doc-graph__stage">
      {visible.nodes.length === 0 ? (
        <p className="docs-empty docs-empty--pane">Под фильтры не попал ни один узел. Включите типы или смените готовность.</p>
      ) : (
        <DocGraphCanvas
          graph={visible}
          selectedId={props.selected?.id ?? null}
          matches={props.matches}
          onSelect={(id) => selectOnCanvas(props.st, visible, id)}
          onOpen={(id) => {
            const n = visible.nodes.find((x) => x.id === id);
            if (n !== undefined) {
              open(n);
            }
          }}
          testId="doc-graph-canvas"
          ariaLabel={`Граф документации: ${visible.nodes.length} узлов, ${visible.edges.length} связей`}
        />
      )}
    </div>
  );
}

/** Вид «Граф» документации. */
export function DocGraphView(props: { readonly switcher: ReactNode }) {
  const full = useDocGraph();
  const visible = useVisibleGraph(full);
  const st = useDocGraphStore();
  const matches = useMemo(() => searchGraph(visible, st.query), [visible, st.query]);
  const selected = st.selected === null ? undefined : visible.nodes.find((n) => n.id === st.selected);
  if (full.nodes.length === 0) {
    return (
      <div className="doc-graph">
        <aside className="doc-graph__side">{props.switcher}</aside>
        <p className="docs-empty docs-empty--pane">В карте нет документов — граф строить не из чего.</p>
      </div>
    );
  }
  return (
    <div className={`doc-graph${selected === undefined ? '' : ' doc-graph--card'}`} data-testid="doc-graph">
      <aside className="doc-graph__side">
        {props.switcher}
        <GraphSearch visible={visible} matches={matches} st={st} />
        <ReadinessSection full={full} st={st} />
        <KindsSection full={full} st={st} />
        <EpochsSection full={full} st={st} />
        <p className="doc-graph__stats" data-testid="graph-stats">
          {visible.nodes.length} узлов · {visible.edges.length} связей
        </p>
      </aside>
      <GraphStage visible={visible} matches={matches} selected={selected} st={st} />
      {selected === undefined ? null : <NodeCard graph={visible} node={selected} />}
    </div>
  );
}
