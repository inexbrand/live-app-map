/**
 * Значок типа узла — та же форма, что на графе: легенда в фильтрах и списках.
 */
import type { GraphNodeKind } from '../../lib/doc-graph';

const FILLED: ReadonlySet<GraphNodeKind> = new Set(['epoch', 'epoch-file', 'note', 'guide', 'route']);
const MUTED: ReadonlySet<GraphNodeKind> = new Set(['epoch-file', 'file', 'screen', 'table', 'service']);

/** Заливка и обводка значка. */
type MarkPaint = { readonly fill: string; readonly stroke: string; readonly strokeWidth: number; readonly opacity: number };

/** Форма значка по типу. */
function markShape(k: GraphNodeKind, common: MarkPaint) {
  switch (k) {
    case 'route':
      return <path d="M6 1.5 10.5 6 6 10.5 1.5 6Z" {...common} />;
    case 'table':
    case 'service':
      return <rect x="2" y="2" width="8" height="8" {...common} />;
    case 'screen':
      return <rect x="3" y="1.5" width="6" height="9" {...common} />;
    case 'note':
    case 'guide':
      return <rect x="2" y="2" width="8" height="8" rx="2.5" {...common} />;
    default:
      return <circle cx="6" cy="6" r={k === 'epoch' ? 4.5 : 3.5} {...common} />;
  }
}

/** Значок формы узла. */
export function KindMark(props: { readonly kind: GraphNodeKind }) {
  const k = props.kind;
  const common = {
    fill: FILLED.has(k) ? 'currentColor' : 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    opacity: MUTED.has(k) ? 0.7 : 1,
  };
  return (
    <svg className="kind-mark" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      {markShape(k, common)}
    </svg>
  );
}