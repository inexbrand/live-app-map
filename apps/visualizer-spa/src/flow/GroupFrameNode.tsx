/**
 * Рамка группы на холсте: поверхность приложения или сервисы бэкенда.
 * Подпись крупная — читается и при сильном отдалении.
 */
import type { NodeProps } from '@xyflow/react';

/** Данные рамки. */
export type GroupFrameData = { readonly title: string; readonly count: number };

/**
 * Рамка группы с подписью и числом нод.
 */
export function GroupFrameNode(props: NodeProps) {
  const data = props.data as GroupFrameData;
  return (
    <div className="group-frame" data-lam-group={props.id}>
      <div className="group-frame__title">
        {data.title}
        <span className="group-frame__count">{data.count}</span>
      </div>
    </div>
  );
}
