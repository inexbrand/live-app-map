/**
 * Значок типа узла — та же форма, что на графе: легенда в фильтрах и списках.
 */
import type { GraphNodeKind } from '../../lib/doc-graph';

/** Значок формы узла. */
export function KindMark(props: { readonly kind: GraphNodeKind }) {
  const k = props.kind;
  const filled = k === 'epoch' || k === 'epoch-file' || k === 'note' || k === 'guide' || k === 'route';
  const muted = k === 'epoch-file' || k === 'file' || k === 'screen' || k === 'table' || k === 'service';
  const common = {
    fill: filled ? 'currentColor' : 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    opacity: muted ? 0.7 : 1,
  };
  let shape;
  switch (k) {
    case 'route':
      shape = <path d="M6 1.5 10.5 6 6 10.5 1.5 6Z" {...common} />;
      break;
    case 'table':
    case 'service':
      shape = <rect x="2" y="2" width="8" height="8" {...common} />;
      break;
    case 'screen':
      shape = <rect x="3" y="1.5" width="6" height="9" {...common} />;
      break;
    case 'note':
    case 'guide':
      shape = <rect x="2" y="2" width="8" height="8" rx="2.5" {...common} />;
      break;
    default:
      shape = <circle cx="6" cy="6" r={k === 'epoch' ? 4.5 : 3.5} {...common} />;
  }
  return (
    <svg className="kind-mark" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      {shape}
    </svg>
  );
}
