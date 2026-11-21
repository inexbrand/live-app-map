/**
 * Локальный граф открытого документа (как в Obsidian): документ, его соседи
 * на одну-две ступени и списки «ссылается на» / «ссылаются сюда».
 */
import { useMemo } from 'react';
import { docNodeId, localGraph, type GraphNode } from '../../lib/doc-graph';
import { useDocGraph, useOpenGraphNode } from '../../lib/use-doc-graph';
import { useDocGraphStore } from '../../store/doc-graph-store';
import { useViewStore } from '../../store/view-store';
import { Chip } from '../../ui';
import { DocGraphCanvas } from './DocGraphCanvas';

const NO_MATCHES: ReadonlySet<string> = new Set();
import { KindMark } from './KindMark';

/** Список связей одного направления. */
function LinkList(props: { readonly title: string; readonly nodes: readonly GraphNode[]; readonly onOpen: (n: GraphNode) => void; readonly testId: string }) {
  if (props.nodes.length === 0) {
    return null;
  }
  return (
    <section className="local-graph__list" data-testid={props.testId}>
      <h3>
        {props.title} <span className="docs-count">{props.nodes.length}</span>
      </h3>
      <ul>
        {props.nodes.map((n) => (
          <li key={n.id}>
            <button type="button" className="doc-graph__link" onClick={() => props.onOpen(n)} title={n.detail} disabled={n.docPath === undefined && (n.target === undefined || n.target.kind === 'file')}>
              <KindMark kind={n.kind} />
              <span>{n.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Локальный граф документа. */
export function LocalGraph(props: { readonly docPath: string }) {
  const full = useDocGraph();
  const depth = useDocGraphStore((s) => s.localDepth);
  const setDepth = useDocGraphStore((s) => s.setLocalDepth);
  const setDocsMode = useViewStore((s) => s.setDocsMode);
  const selectInGraph = useDocGraphStore((s) => s.select);
  const open = useOpenGraphNode();
  const center = docNodeId(props.docPath);
  const local = useMemo(() => localGraph(full, center, depth), [full, center, depth]);
  const { outgoing, incoming } = useMemo(() => {
    const byId = new Map(full.nodes.map((n) => [n.id, n]));
    const out: GraphNode[] = [];
    const inc: GraphNode[] = [];
    for (const e of full.edges) {
      if (e.kind === 'belongs') {
        continue;
      }
      if (e.source === center) {
        const n = byId.get(e.target);
        if (n !== undefined) {
          out.push(n);
        }
      } else if (e.target === center) {
        const n = byId.get(e.source);
        if (n !== undefined) {
          inc.push(n);
        }
      }
    }
    return { outgoing: out, incoming: inc };
  }, [full, center]);
  const nodeOf = (id: string): GraphNode | undefined => local.nodes.find((n) => n.id === id);

  return (
    <aside className="local-graph" data-testid="local-graph" aria-label="Связи документа">
      <div className="local-graph__head">
        <h3>Связи</h3>
        <div className="local-graph__depth" role="group" aria-label="Глубина">
          <Chip active={depth === 1} onClick={() => setDepth(1)}>
            1 шаг
          </Chip>
          <Chip active={depth === 2} onClick={() => setDepth(2)}>
            2 шага
          </Chip>
        </div>
      </div>
      {local.nodes.length <= 1 ? (
        <p className="docs-empty">Документ ни на что не ссылается, и на него не ссылаются.</p>
      ) : (
        <DocGraphCanvas
          graph={local}
          selectedId={center}
          matches={NO_MATCHES}
          compact
          onSelect={(id) => {
            const n = id === null || id === center ? undefined : nodeOf(id);
            if (n !== undefined) {
              open(n);
            }
          }}
          onOpen={(id) => {
            const n = nodeOf(id);
            if (n !== undefined) {
              open(n);
            }
          }}
          testId="local-graph-canvas"
          ariaLabel={`Связи документа: ${local.nodes.length - 1} узлов`}
        />
      )}
      <button
        type="button"
        className="local-graph__full"
        onClick={() => {
          selectInGraph(center);
          setDocsMode('graph');
        }}
      >
        Открыть в общем графе
      </button>
      <LinkList title="Ссылается на" nodes={outgoing} onOpen={open} testId="local-graph-out" />
      <LinkList title="Ссылаются сюда" nodes={incoming} onOpen={open} testId="local-graph-in" />
    </aside>
  );
}
