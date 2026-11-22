/**
 * Скрытый статус-бар: иконка </> → панель логов и диагностики.
 */
import { Code2, Eraser, Filter } from 'lucide-react';
import { useMemo } from 'react';
import { DEFAULT_MAX_PINNED, useAppStore } from '../store/app-store';
import { Button, Field, Select } from '../ui';
import { EdgeSheet } from './EdgeSheet';

type LogEntry = ReturnType<typeof useAppStore.getState>['logs'][number];

/** Роль по-русски для строки статуса. */
function roleLabel(role: string): string {
  return role === 'recruiter' ? 'рекрутер' : role === 'employer' ? 'клиент' : '—';
}

/** Счётчик с пределом; безлимит (≥ 9999) — без предела. */
function Count({ value, max }: { readonly value: number; readonly max: number }) {
  return (
    <strong>
      {value}
      {max >= 9999 ? '' : `/${max}`}
    </strong>
  );
}

/** Строка статуса: слоты iframe, закреплённые, роль, экраны, предупреждения. */
function DiagStats() {
  const liveCount = useAppStore((s) => s.livePageIds.size);
  const warmCount = useAppStore((s) => s.warmPageIds.size);
  const mountedCount = useAppStore((s) => s.mountedPageIds.size);
  const maxLive = useAppStore((s) => s.maxLiveIframes);
  const maxWarm = useAppStore((s) => s.maxWarmIframes);
  const pinCount = useAppStore((s) => s.pinnedPageIds.size);
  const globalRole = useAppStore((s) => s.globalRole);
  const issues = useAppStore((s) => s.parseIssues.length);
  const pages = useAppStore((s) => s.document?.nodes.filter((n) => n.kind === 'page').length ?? 0);
  return (
    <div className="diag-stats">
      <span>
        режим <strong>живой</strong>
      </span>
      <span>
        live <Count value={liveCount} max={maxLive} />
      </span>
      <span>
        warm <Count value={warmCount} max={maxWarm} />
      </span>
      <span>
        mounted <strong>{mountedCount}</strong>
      </span>
      <span>
        pin <strong>{pinCount}/{DEFAULT_MAX_PINNED}</strong>
      </span>
      <span>
        роль <strong>{roleLabel(globalRole)}</strong>
      </span>
      <span>
        экранов <strong>{pages}</strong>
      </span>
      <span>
        предупр. <strong>{issues}</strong>
      </span>
    </div>
  );
}

/** Выбор экрана для фильтра лога. */
function LogFilter() {
  const filter = useAppStore((s) => s.logFilterPageId);
  const setFilter = useAppStore((s) => s.setLogFilterPageId);
  const document = useAppStore((s) => s.document);
  const pageOptions = useMemo(() => (document?.nodes ?? []).filter((n) => n.kind === 'page').map((n) => ({ id: n.id, title: n.title })), [document]);
  return (
    <Field label="Фильтр по экрану" htmlFor="log-filter">
      <Select
        id="log-filter"
        value={filter ?? ''}
        onChange={(e) =>
          setFilter(e.target.value === '' ? null : e.target.value)
        }
      >
        <option value="">Все источники</option>
        {pageOptions.map((p) => (
          <option key={p.id} value={p.id}>
            {p.title}
          </option>
        ))}
      </Select>
    </Field>
  );
}

/** Лог, новые сверху; с фильтром — экран и системные события. */
function LogList() {
  const logs = useAppStore((s) => s.logs);
  const filter = useAppStore((s) => s.logFilterPageId);
  const filtered = useMemo<readonly LogEntry[]>(() => (filter ? logs.filter((l) => l.source === filter || l.source === 'system') : logs), [logs, filter]);
  return (
    <div className="diag-log-list" role="log" aria-live="polite">
      {filtered.length === 0 ? (
        <p className="drawer__hint">Пока пусто — загрузите карту или live.</p>
      ) : (
        [...filtered].reverse().map((entry) => (
          <div
            key={entry.id}
            className={`diag-log-line diag-log-line--${entry.level}`}
          >
            <span className="diag-log-line__meta">
              {entry.ts.slice(11, 19)} · {entry.level} · {entry.source}
            </span>
            <span className="diag-log-line__msg">{entry.message}</span>
          </div>
        ))
      )}
    </div>
  );
}

/**
 * Плавающая кнопка логов + sheet.
 */
export function DiagnosticsDock() {
  const open = useAppStore((s) => s.diagnosticsOpen);
  const setOpen = useAppStore((s) => s.setDiagnosticsOpen);
  const logCount = useAppStore((s) => s.logs.length);
  const clearLogs = useAppStore((s) => s.clearLogs);
  const setFilter = useAppStore((s) => s.setLogFilterPageId);

  return (
    <>
      <button
        type="button"
        className={`diag-fab${open ? ' diag-fab--on' : ''}`}
        title="Логи и статус"
        aria-label="Открыть логи и статус"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Code2 size={15} strokeWidth={1.75} />
        {logCount > 0 ? (
          <span className="diag-fab__badge">{Math.min(99, logCount)}</span>
        ) : null}
      </button>

      <EdgeSheet
        open={open}
        side="bottom"
        title="Логи и статус"
        description="Системные события и load/error iframe по экранам."
        onClose={() => setOpen(false)}
      >
        <DiagStats />
        <LogFilter />
        <LogList />
        <div className="drawer__actions">
          <Button type="button" variant="outline" size="sm" onClick={() => clearLogs()}>
            <Eraser size={14} strokeWidth={1.75} />
            Очистить лог
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setFilter(null)}
          >
            <Filter size={14} strokeWidth={1.75} />
            Сбросить фильтр
          </Button>
        </div>
      </EdgeSheet>
    </>
  );
}
