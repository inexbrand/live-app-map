/**
 * Статус и лог выбранного экрана в его панели: живой ли iframe, закреплён ли, вход, обрезка
 * и записи журнала этого экрана (загрузка, ошибки). Заменяет общую панель «Логи и статус».
 */
import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { pageStatus } from '../lib/gateway/page-status';
import { useAppStore } from '../store/app-store';
import { useGatewayStore } from '../store/gateway-store';

type LogEntry = ReturnType<typeof useAppStore.getState>['logs'][number];

/** Где сейчас iframe экрана: живой, на паузе или только снимок. */
export type FrameState = 'live' | 'warm' | 'snapshot';

/**
 * Состояние iframe экрана по наборам стора.
 *
 * @param id - id экрана
 * @param live - живые экраны
 * @param warm - экраны на паузе
 */
export function frameState(id: string, live: ReadonlySet<string>, warm: ReadonlySet<string>): FrameState {
  if (live.has(id)) {
    return 'live';
  }
  return warm.has(id) ? 'warm' : 'snapshot';
}

const FRAME_LABEL: Readonly<Record<FrameState, string>> = { live: 'живой', warm: 'на паузе', snapshot: 'снимок' };

/** Строки статуса: iframe, закрепление, вход, обрезка. */
function StatusBadges(props: { readonly pageId: string }) {
  const state = useAppStore((s) => frameState(props.pageId, s.livePageIds, s.warmPageIds));
  const pinned = useAppStore((s) => s.pinnedPageIds.has(props.pageId));
  const report = useGatewayStore((s) => s.reports.get(props.pageId));
  const status = pageStatus(report, report?.contentHeight ?? 0);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5" data-testid="screen-status">
        <Badge variant={state === 'live' ? 'default' : 'secondary'}>{FRAME_LABEL[state]}</Badge>
        {pinned ? <Badge variant="outline">закреплён</Badge> : null}
        {report === undefined ? <Badge variant="outline">отчёта шлюза нет</Badge> : null}
      </div>
      {status.unauthorized === null ? null : <p className="text-sm text-[var(--attention)]">{status.unauthorized}</p>}
    </div>
  );
}

/** Записи журнала экрана, новые сверху. */
function ScreenLogList(props: { readonly entries: readonly LogEntry[] }) {
  if (props.entries.length === 0) {
    return <p className="text-sm text-muted-foreground">Записей нет: экран ещё не грузился или загрузился без ошибок.</p>;
  }
  return (
    <ol className="flex max-h-64 flex-col gap-1 overflow-y-auto rounded-lg border bg-card p-2 text-xs" role="log" aria-live="polite" data-testid="screen-log">
      {[...props.entries].reverse().map((entry) => (
        <li key={entry.id} className="flex flex-col gap-0.5 border-b pb-1 last:border-b-0 last:pb-0">
          <span className="text-muted-foreground tabular-nums">
            {entry.ts.slice(11, 19)} · {entry.level}
          </span>
          <span className={entry.level === 'error' ? 'text-[var(--attention)]' : undefined}>{entry.message}</span>
        </li>
      ))}
    </ol>
  );
}

/**
 * Статус и лог экрана.
 *
 * @param props - id экрана
 */
export function ScreenStatusLog(props: { readonly pageId: string }) {
  const logs = useAppStore((s) => s.logs);
  const entries = useMemo(() => logs.filter((l) => l.source === props.pageId), [logs, props.pageId]);
  return (
    <section className="flex flex-col gap-2" aria-label="Статус и лог экрана">
      <h3 className="text-sm font-medium">Статус и лог</h3>
      <StatusBadges pageId={props.pageId} />
      <ScreenLogList entries={entries} />
    </section>
  );
}
