/**
 * Верх карточки экрана: название, кнопки (под мышью и у выбранной), строка пути
 * (размер окна — только у выбранной). В покое карточка — название и путь.
 */
import type { AppMapNode, DeviceViewport } from '@live-app-map/schema';
import type { PageStatus } from '../../lib/gateway/page-status';
import { NodeActions } from './NodeActions';
import { NodePath } from './NodePath';

/** Props верха карточки. */
export type NodeTopProps = {
  readonly node: AppMapNode;
  readonly url: string | null;
  readonly status: PageStatus;
  readonly viewport: DeviceViewport;
  /** Показать кнопки: нода под мышью или выбрана. */
  readonly chrome: boolean;
  readonly selected: boolean;
  readonly isPinned: boolean;
  readonly openComments: number;
};

/**
 * Верх карточки.
 *
 * @param props - нода, адрес, состояние, окно и что показывать
 */
export function NodeTop(props: NodeTopProps) {
  const { node } = props;
  return (
    <>
      <div className="page-node__header">
        <div className="page-node__title" title={node.title}>{node.title}</div>
        {props.chrome ? <NodeActions nodeId={node.id} isPinned={props.isPinned} /> : null}
      </div>
      {/* Состояние — строкой пути: в шапке узкой ноды значки выдавливали заголовок. */}
      <NodePath node={node} url={props.url} status={props.status} openComments={props.openComments} viewport={props.selected ? props.viewport : null} />
    </>
  );
}

