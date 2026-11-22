/**
 * Строка пути ноды: состояние (не авторизован, обрезано, замечания, live/warm), путь, размер окна.
 */
import type { AppMapNode, DeviceViewport } from '@live-app-map/schema';
import { commentsLabel } from '../../lib/comments/format';
import type { PageStatus } from '../../lib/gateway/page-status';
import { Badge } from '../../ui';

/** Props строки пути. */
export type NodePathProps = {
  readonly node: AppMapNode;
  readonly url: string | null;
  readonly status: PageStatus;
  readonly openComments: number;
  readonly isLive: boolean;
  readonly isWarm: boolean;
  readonly viewport: DeviceViewport;
};

/**
 * Строка пути.
 *
 * @param props - нода, адрес, состояние и окно
 */
export function NodePath(props: NodePathProps) {
  const { node, url, status, openComments, isLive, isWarm, viewport } = props;
  return (
  <div className="page-node__path" title={url ?? node.pathPattern}>
    <StatusBadges status={status} openComments={openComments} isLive={isLive} isWarm={isWarm} />
    <span className="page-node__path-text">{node.pathExample ?? node.pathPattern}</span>
    <span className="page-node__size">
      {' '}
      · {viewport.width}×{viewport.height}
      {viewport.heightMode === 'auto' ? ' auto' : ''}
      {viewport.label ? ` ${viewport.label}` : ''}
    </span>
  </div>
  );
}

/** Метки состояния окна: вход, обрезка, замечания, live/warm. */
function StatusBadges({ status, openComments, isLive, isWarm }: Pick<NodePathProps, 'status' | 'openComments' | 'isLive' | 'isWarm'>) {
  return (
  <>
    {status.unauthorized !== null ? (
      <Badge className="ui-badge--alert" title={status.unauthorized} data-lam-auth="none">
        не авторизован
      </Badge>
    ) : null}
    {status.cropped !== null ? (
      <Badge className="ui-badge--warn" title={`${status.cropped}. Выберите ноду и нажмите «целиком» — она вырастет до высоты страницы`} data-lam-cropped="1">
        обрезано
      </Badge>
    ) : null}
    {openComments > 0 ? (
      <Badge className="ui-badge--comments" data-lam-comments={openComments} title="Открытые замечания к экрану">
        {commentsLabel(openComments)}
      </Badge>
    ) : null}
    {isLive ? (
      <Badge>live</Badge>
    ) : isWarm ? (
      <Badge>warm</Badge>
    ) : null}
  </>
  );
}