/**
 * Документация графом: фильтры по типу и готовности, поиск, раскрытие эпох по клику,
 * карточка выбранного узла со связями и переходами в текст и на карту.
 */
import { useMemo, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, FileText, MapPin } from 'lucide-react';
import type { EpochReadiness } from '@live-app-map/schema';
import { NODE_KIND_LABELS, NODE_KIND_SINGULAR, type DocGraph, type GraphNode, type GraphNodeKind } from '../../lib/doc-graph';
import { collapseEpochs, filterGraph, graphNeighbors, searchGraph } from '../../lib/doc-graph-query';
import { useDocGraph, useOpenGraphNode } from '../../lib/use-doc-graph';
import { useDocGraphStore } from '../../store/doc-graph-store';
import { Button, Chip, Input } from '../../ui';
import { DocGraphCanvas } from './DocGraphCanvas';
import { KindMark } from './KindMark';

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

/** Карточка выбранного узла. */
function NodeCard(props: { readonly graph: DocGraph; readonly node: GraphNode }) {
  const { graph, node } = props;
  const select = useDocGraphStore((s) => s.select);
  const expanded = useDocGraphStore((s) => s.expanded);
  const toggleEpoch = useDocGraphStore((s) => s.toggleEpoch);
  const open = useOpenGraphNode();
  const neighbors = useMemo(() => {
    const ids = graphNeighbors(graph, node.id);
    const byKind = new Map<GraphNodeKind, GraphNode[]>();
    for (const n of graph.nodes) {
      if (ids.has(n.id)) {
        byKind.set(n.kind, [...(byKind.get(n.kind) ?? []), n]);
      }
    }
    return [...byKind.entries()].sort((a, b) => KINDS.indexOf(a[0]) - KINDS.indexOf(b[0]));
  }, [graph, node.id]);
  const canMap = node.target !== undefined && node.target.kind !== 'file';
  return (
    <aside className="doc-graph__card" data-testid="graph-node-card">
      <p className="doc-graph__kind">
        <KindMark kind={node.kind} /> {NODE_KIND_SINGULAR.get(node.kind) ?? node.kind}
        {node.kind === 'epoch' && node.readiness !== undefined ? ` · ${node.readiness === 'not-ready' ? 'не готово' : node.readiness === 'ready' ? 'готово' : 'нет 09-bugs'}` : ''}
      </p>
      <h2>{node.label}</h2>
      {node.detail === '' || node.detail === node.label ? null : <p className="doc-graph__detail">{node.detail}</p>}
      <div className="doc-graph__actions">
        {node.docPath === undefined ? null : (
          <Button type="button" size="sm" variant="primary" onClick={() => open(node)} data-testid="graph-open-text">
            <FileText size={16} strokeWidth={1.75} /> Открыть текст
          </Button>
        )}
        {canMap ? (
          <Button type="button" size="sm" variant="primary" onClick={() => open(node)} data-testid="graph-open-map">
            <MapPin size={16} strokeWidth={1.75} /> Показать на карте
          </Button>
        ) : null}
        {node.kind === 'epoch' && node.epochId !== undefined ? (
          <Button type="button" size="sm" variant="outline" onClick={() => toggleEpoch(node.epochId ?? '')}>
            {expanded.has(node.epochId) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            {expanded.has(node.epochId) ? 'Свернуть файлы' : 'Показать файлы'}
          </Button>
        ) : null}
      </div>
      <section className="doc-graph__links">
        <h3>
          Связи <span className="docs-count">{neighbors.reduce((s, [, ns]) => s + ns.length, 0)}</span>
        </h3>
        {neighbors.length === 0 ? <p className="docs-empty">Связей нет.</p> : null}
        {neighbors.map(([kind, ns]) => (
          <div key={kind} className="doc-graph__group">
            <p className="doc-graph__group-title">
              {NODE_KIND_LABELS.get(kind)} <span className="docs-count">{ns.length}</span>
            </p>
            <ul>
              {ns.slice(0, 40).map((n) => (
                <li key={n.id}>
                  <button type="button" className="doc-graph__link" onClick={() => select(n.id)} title={n.detail}>
                    <KindMark kind={n.kind} />
                    <span>{n.label}</span>
                  </button>
                </li>
              ))}
            </ul>
            {ns.length > 40 ? <p className="docs-empty">и ещё {ns.length - 40}</p> : null}
          </div>
        ))}
      </section>
    </aside>
  );
}

/** Вид «Граф» документации. */
export function DocGraphView(props: { readonly switcher: ReactNode }) {
  const full = useDocGraph();
  const visible = useVisibleGraph(full);
  const st = useDocGraphStore();
  const open = useOpenGraphNode();
  const matches = useMemo(() => searchGraph(visible, st.query), [visible, st.query]);
  const hits = useMemo(() => visible.nodes.filter((n) => matches.has(n.id)).slice(0, 30), [visible, matches]);
  const counts = useMemo(() => {
    const c = new Map<GraphNodeKind, number>();
    full.nodes.forEach((n) => c.set(n.kind, (c.get(n.kind) ?? 0) + 1));
    return c;
  }, [full]);
  const epochIds = useMemo(() => full.nodes.flatMap((n) => (n.kind === 'epoch' && n.epochId !== undefined ? [n.epochId] : [])), [full]);
  const notReady = full.nodes.filter((n) => n.kind === 'epoch' && n.readiness === 'not-ready').length;
  const selected = st.selected === null ? undefined : visible.nodes.find((n) => n.id === st.selected);

  const onSelect = (id: string | null): void => {
    const n = id === null ? undefined : visible.nodes.find((x) => x.id === id);
    if (n?.kind === 'epoch' && n.epochId !== undefined && (st.selected === n.id || !st.expanded.has(n.epochId))) {
      st.toggleEpoch(n.epochId);
    }
    st.select(id);
  };

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
                <li key={n.id}>
                  <button type="button" className={`doc-graph__link${n.id === st.selected ? ' doc-graph__link--on' : ''}`} onClick={() => st.select(n.id)} data-testid="graph-hit" title={n.detail}>
                    <KindMark kind={n.kind} />
                    <span>{n.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        <section className="docs-group">
          <h3 className="docs-group__title">Готовность эпох</h3>
          <div className="docs-list__filters" role="group" aria-label="Готовность эпох на графе">
            {READINESS.map((r) => (
              <Chip key={r.label} active={st.readiness === r.value} onClick={() => st.setReadiness(r.value)}>
                {r.label}
                {r.value === 'not-ready' ? <span className="docs-count"> {notReady}</span> : null}
              </Chip>
            ))}
          </div>
        </section>
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
            {KINDS.filter((k) => (counts.get(k) ?? 0) > 0).map((k) => {
              const on = st.kinds.size === 0 || st.kinds.has(k);
              return (
                <li key={k}>
                  <button type="button" className={`doc-graph__kind-row${on ? '' : ' doc-graph__kind-row--off'}`} aria-pressed={st.kinds.has(k)} onClick={() => st.toggleKind(k)} data-testid={`graph-kind-${k}`}>
                    <KindMark kind={k} />
                    <span>{NODE_KIND_LABELS.get(k)}</span>
                    <span className="docs-count">{counts.get(k)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
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
        <p className="doc-graph__stats" data-testid="graph-stats">
          {visible.nodes.length} узлов · {visible.edges.length} связей
        </p>
      </aside>
      <div className="doc-graph__stage">
        {visible.nodes.length === 0 ? (
          <p className="docs-empty docs-empty--pane">Под фильтры не попал ни один узел. Включите типы или смените готовность.</p>
        ) : (
          <DocGraphCanvas
            graph={visible}
            selectedId={selected?.id ?? null}
            matches={matches}
            onSelect={onSelect}
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
      {selected === undefined ? null : <NodeCard graph={visible} node={selected} />}
    </div>
  );
}
