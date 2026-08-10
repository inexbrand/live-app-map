/**
 * Скрытый статус-бар: иконка </> → панель логов и диагностики.
 */
import { Code2, Eraser, Filter } from 'lucide-react';
import { useMemo } from 'react';
import { DEFAULT_MAX_PINNED, useAppStore } from '../store/app-store';
import { Button, Field, Select } from '../ui';
import { EdgeSheet } from './EdgeSheet';

/**
 * Плавающая кнопка логов + sheet.
 */
export function DiagnosticsDock() {
  const open = useAppStore((s) => s.diagnosticsOpen);
  const setOpen = useAppStore((s) => s.setDiagnosticsOpen);
  const logs = useAppStore((s) => s.logs);
  const clearLogs = useAppStore((s) => s.clearLogs);
  const filter = useAppStore((s) => s.logFilterPageId);
  const setFilter = useAppStore((s) => s.setLogFilterPageId);
  const liveCount = useAppStore((s) => s.livePageIds.size);
  const maxLive = useAppStore((s) => s.maxLiveIframes);
  const pinCount = useAppStore((s) => s.pinnedPageIds.size);
  const globalRole = useAppStore((s) => s.globalRole);
  const parseIssues = useAppStore((s) => s.parseIssues);
  const document = useAppStore((s) => s.document);
  const pages =
    document?.nodes.filter((n) => n.kind === 'page').length ?? 0;

  const filtered = useMemo(() => {
    if (!filter) {
      return logs;
    }
    return logs.filter((l) => l.source === filter || l.source === 'system');
  }, [logs, filter]);

  const pageOptions = useMemo(() => {
    if (!document) {
      return [];
    }
    return document.nodes
      .filter((n) => n.kind === 'page')
      .map((n) => ({ id: n.id, title: n.title }));
  }, [document]);

  const roleRu =
    globalRole === 'recruiter'
      ? 'рекрутер'
      : globalRole === 'employer'
        ? 'клиент'
        : '—';

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
        <Code2 size={18} strokeWidth={1.75} />
        {logs.length > 0 ? (
          <span className="diag-fab__badge">{Math.min(99, logs.length)}</span>
        ) : null}
      </button>

      <EdgeSheet
        open={open}
        side="bottom"
        title="Логи и статус"
        description="Системные события и load/error iframe по экранам."
        onClose={() => setOpen(false)}
      >
        <div className="diag-stats">
          <span>
            режим <strong>живой</strong>
          </span>
          <span>
            живых <strong>{liveCount}/{maxLive}</strong>
          </span>
          <span>
            pin <strong>{pinCount}/{DEFAULT_MAX_PINNED}</strong>
          </span>
          <span>
            роль <strong>{roleRu}</strong>
          </span>
          <span>
            экранов <strong>{pages}</strong>
          </span>
          <span>
            предупр. <strong>{parseIssues.length}</strong>
          </span>
        </div>

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
