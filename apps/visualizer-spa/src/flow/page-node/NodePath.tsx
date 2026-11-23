/**
 * Строка пути ноды: проблемы экрана (не авторизован, обрезано, замечания), путь;
 * размер окна — только у выбранной ноды.
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
  /** Окно ноды; null — размер не показывать (нода не выбрана). */
  readonly viewport: DeviceViewport | null;
};

/**
 * Строка пути.
 *
 * @param props - нода, адрес, состояние и окно
 */
export function NodePath(props: NodePathProps) {
  const { node, url, status, openComments, viewport } = props;
  return (
  <div className="page-node__path" title={url ?? node.pathPattern}>
    <StatusBadges status={status} openComments={openComments} />
    <span className="page-node__path-text">{node.pathExample ?? node.pathPattern}</span>
    {viewport === null ? null : (
      <span className="page-node__size">
        {' '}
        · {viewport.width}×{viewport.height}
        {viewport.heightMode === 'auto' ? ' целиком' : ''}
      </span>
    )}
  </div>
  );
}

/** Метки проблем окна: вход, обрезка, замечания. Служебное состояние iframe — в логе. */
function StatusBadges({ status, openComments }: Pick<NodePathProps, 'status' | 'openComments'>) {
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
  </>
  );
}
