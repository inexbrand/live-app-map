/**
 * Вкладка «Схема в коде»: объявление таблицы из файла проекта с номерами строк,
 * поле «Предложить комментарий» (замечание агенту) и замечания к этой таблице.
 */
import { useEffect, useState } from 'react';
import type { DbTable } from '@live-app-map/schema';
import { tablePageId, tableCommentAnchor } from '../../lib/db-data/table-comment';
import { requestJson } from '../../lib/dev-api';
import { PROJECT_SOURCE_PATH, sourceSnippetSchema, type SourceSnippet } from '../../lib/project/source-contract';
import { useAppStore } from '../../store/app-store';
import { useCommentsStore } from '../../store/comments-store';
import { CommentField } from '../comments/CommentField';
import { ThreadCard } from '../comments/ThreadCard';

type Loaded = { readonly state: 'loading' } | { readonly state: 'ok'; readonly snippet: SourceSnippet } | { readonly state: 'error'; readonly message: string };

/** Объявление таблицы с dev-сервера; меняется с таблицей. */
function useSnippet(table: DbTable): Loaded {
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' });
  const { file, line } = table.location;
  useEffect(() => {
    let alive = true;
    setLoaded({ state: 'loading' });
    void requestJson(`${PROJECT_SOURCE_PATH}?file=${encodeURIComponent(file)}&line=${line}`).then((r) => {
      if (!alive) {
        return;
      }
      if (!r.ok) {
        setLoaded({ state: 'error', message: r.error });
        return;
      }
      const parsed = sourceSnippetSchema.safeParse(r.value);
      setLoaded(parsed.success ? { state: 'ok', snippet: parsed.data } : { state: 'error', message: 'ответ исходника не по схеме' });
    });
    return () => {
      alive = false;
    };
  }, [file, line]);
  return loaded;
}

/** Код с номерами строк. */
function CodeBlock(props: { readonly snippet: SourceSnippet }) {
  const lines = props.snippet.text.split('\n');
  return (
    <pre className="db-code" data-testid="db-code">
      {lines.map((l, i) => (
        <div key={i} className="db-code__line">
          <span className="db-code__no">{props.snippet.startLine + i}</span>
          <span>{l}</span>
        </div>
      ))}
    </pre>
  );
}

/** Поле замечания к объявлению. */
function ProposeComment(props: { readonly table: DbTable; readonly snippet: SourceSnippet }) {
  const mapName = useAppStore((s) => s.document?.project.name ?? null);
  const refresh = useCommentsStore((s) => s.refresh);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = (value: string): void => {
    if (value.trim() === '') {
      setError('Напишите, что поменять в схеме таблицы');
      return;
    }
    setBusy(true);
    const anchor = tableCommentAnchor(props.table, props.snippet, mapName);
    void requestJson('/api/comments', { method: 'POST', json: { id: crypto.randomUUID(), text: value, anchor, shotDataUrl: null } }).then((r) => {
      setBusy(false);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setText('');
      setError(null);
      void refresh();
    });
  };
  return (
    <section className="db-view__section" data-testid="db-code-comment">
      <h3>Предложить комментарий</h3>
      <CommentField
        value={text}
        onChange={setText}
        onSubmit={submit}
        onEscape={() => setText('')}
        placeholder="Что поменять в схеме: индекс, тип, связь, описание колонки"
        busy={busy}
        error={error}
      />
    </section>
  );
}

/** Замечания к этой таблице из общего списка. */
function TableThreads(props: { readonly exportName: string }) {
  const threads = useCommentsStore((s) => s.threads);
  const focusId = useCommentsStore((s) => s.focusId);
  const pageId = tablePageId(props.exportName);
  const mine = threads.filter((t) => t.anchor.pageId === pageId);
  if (mine.length === 0) {
    return null;
  }
  return (
    <section className="db-view__section">
      <h3>
        Замечания <span className="db-view__count">{mine.length}</span>
      </h3>
      {mine.map((t) => (
        <ThreadCard key={t.id} thread={t} focused={t.id === focusId} />
      ))}
    </section>
  );
}

/** Вкладка «Схема в коде». */
export function TableCodeTab(props: { readonly table: DbTable }) {
  const loaded = useSnippet(props.table);
  const t = props.table;
  return (
    <div className="db-view__detail" data-testid="db-table-code">
      <header className="db-view__head">
        <h2>{t.name}</h2>
        <span className="drawer__hint font-mono">
          {t.location.file}
          {loaded.state === 'ok' ? `:${loaded.snippet.startLine}–${loaded.snippet.endLine}` : `:${t.location.line}`}
        </span>
      </header>
      {loaded.state === 'loading' ? <p className="drawer__hint">Читаю файл…</p> : null}
      {loaded.state === 'error' ? (
        <p className="drawer__hint" role="alert">
          Код не прочитан: {loaded.message}
        </p>
      ) : null}
      {loaded.state === 'ok' ? (
        <>
          <CodeBlock snippet={loaded.snippet} />
          <ProposeComment table={t} snippet={loaded.snippet} />
        </>
      ) : null}
      <TableThreads exportName={t.exportName} />
    </div>
  );
}
