/**
 * Вид «Документация»: эпохи задач (дата, цель, статус, готовность по 09-bugs),
 * заметки агентов и руководства; документ markdown со ссылками в карту и скриншотами эпохи.
 */
import { useEffect, useMemo, useState } from 'react';
import type { DocEpoch, DocFile, DocsModel, EpochReadiness } from '@live-app-map/schema';
import { docsSections, epochDateLabel, openDocOf, readinessLabel } from '../lib/docs-view-model';
import { useAppStore } from '../store/app-store';
import { useViewStore } from '../store/view-store';
import { Chip, Input } from '../ui';
import { fetchLiveDocs } from '../lib/docs-live-client';
import { EmptyView } from '../ui/empty-view';
import { DocPane } from './DocPane';
import { DocsSourceLine, READING_DOCS } from './DocsSourceLine';
import { DocGraphView } from './graph/DocGraphView';

/** Переключатель «Текст / Граф» вида «Документация». Клавиша G. */
function DocsModeSwitch() {
  const mode = useViewStore((s) => s.docsMode);
  const setMode = useViewStore((s) => s.setDocsMode);
  return (
    <div className="docs-mode" role="group" aria-label="Режим документации">
      <button type="button" className={`docs-mode__btn${mode === 'text' ? ' docs-mode__btn--on' : ''}`} aria-pressed={mode === 'text'} onClick={() => setMode('text')}>
        Текст
      </button>
      <button type="button" className={`docs-mode__btn${mode === 'graph' ? ' docs-mode__btn--on' : ''}`} aria-pressed={mode === 'graph'} onClick={() => setMode('graph')} data-testid="docs-mode-graph" title="Граф связей (G)">
        Граф
      </button>
    </div>
  );
}

const READINESS: readonly { value: EpochReadiness | null; label: string }[] = [
  { value: null, label: 'Все' },
  { value: 'not-ready', label: 'Не готово' },
  { value: 'ready', label: 'Готово' },
  { value: 'no-bugs-file', label: 'Без 09-bugs' },
];

/** Строка эпохи в списке. */
function EpochRow(props: { readonly epoch: DocEpoch; readonly active: boolean; readonly onOpen: () => void }) {
  const e = props.epoch;
  return (
    <li>
      <button
        type="button"
        className={`docs-row${props.active ? ' docs-row--on' : ''}`}
        onClick={props.onOpen}
        data-testid="docs-epoch-row"
        title={e.summary ?? e.id}
      >
        <span className="docs-row__line">
          <span className="docs-row__name">{e.slug}</span>
          <span className="docs-row__meta">{epochDateLabel(e.date)}</span>
        </span>
        {e.summary === undefined ? null : <span className="docs-row__summary">{e.summary}</span>}
        {/* «готово» — обычное состояние, не повторяется в каждой строке */}
        {e.readiness === 'ready' ? null : <span className={`docs-row__state${e.readiness === 'not-ready' ? ' docs-row__state--open' : ''}`}>{readinessLabel(e)}</span>}
      </button>
    </li>
  );
}

/** Строка заметки или руководства. */
function FileRow(props: { readonly file: DocFile; readonly active: boolean; readonly onOpen: () => void }) {
  return (
    <li>
      <button type="button" className={`docs-row${props.active ? ' docs-row--on' : ''}`} onClick={props.onOpen} title={props.file.path}>
        <span className="docs-row__name">{props.file.title}</span>
        <span className="docs-row__summary">{props.file.path}</span>
      </button>
    </li>
  );
}

/**
 * Документация с диска: при открытии вида раздел docs карты заменяется снятым сейчас
 * (снимок в карте мог устареть). Нет каталога на этой машине — остаётся снимок.
 *
 * @param root - docs.root карты
 * @returns true — документация с диска (можно отмечать пункты), иначе причина
 */
function useLiveDocs(root: string | undefined): true | string {
  const setDocs = useAppStore((s) => s.setDocs);
  const [live, setLive] = useState<true | string>(READING_DOCS);
  useEffect(() => {
    if (root === undefined) {
      return;
    }
    let cancelled = false;
    void fetchLiveDocs(root).then((r) => {
      if (cancelled) {
        return;
      }
      if (r.ok) {
        setDocs(r.value);
      }
      setLive(r.ok ? true : r.error);
    });
    return () => {
      cancelled = true;
    };
  }, [root, setDocs]);
  return live;
}

type Sections = ReturnType<typeof docsSections>;

/** Совпадения поиска в тексте документов. */
function HitsSection(props: { readonly hits: Sections['hits']; readonly openDoc: (path: string) => void }) {
  if (props.hits.length === 0) {
    return null;
  }
  return (
    <section className="docs-group">
      <h3 className="docs-group__title">
        Совпадения в тексте <span className="docs-count">{props.hits.length}</span>
      </h3>
      <ul>
        {props.hits.map((h) => (
          <li key={`${h.path}:${h.line}`}>
            <button type="button" className="docs-row" onClick={() => props.openDoc(h.path)} data-testid="docs-hit">
              <span className="docs-row__line">
                <span className="docs-row__name">{h.epochId ?? h.title}</span>
                <span className="docs-row__meta">стр. {h.line}</span>
              </span>
              <span className="docs-row__summary">{h.snippet}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Заметки или руководства списком; пусто — раздела нет. */
function FilesSection(props: { readonly title: string; readonly files: readonly DocFile[]; readonly openPath: string | undefined; readonly openDoc: (path: string) => void }) {
  if (props.files.length === 0) {
    return null;
  }
  return (
    <section className="docs-group">
      <h3 className="docs-group__title">
        {props.title} <span className="docs-count">{props.files.length}</span>
      </h3>
      <ul>
        {props.files.map((f) => (
          <FileRow key={f.path} file={f} active={props.openPath === f.path} onOpen={() => props.openDoc(f.path)} />
        ))}
      </ul>
    </section>
  );
}

/** Эпохи списком; пусто — почему. */
function EpochsSection(props: { readonly epochs: Sections['epochs']; readonly total: number; readonly openId: string | undefined; readonly openDoc: (path: string) => void }) {
  return (
    <section className="docs-group">
      <h3 className="docs-group__title">
        Эпохи <span className="docs-count">{props.epochs.length}</span>
      </h3>
      {props.epochs.length === 0 ? <p className="docs-empty">{props.total === 0 ? 'В проекте нет docs/epoch.' : 'Ничего не найдено.'}</p> : null}
      <ul>
        {props.epochs.map((e) => (
          <EpochRow key={e.id} epoch={e} active={props.openId === e.id} onOpen={() => props.openDoc(e.dir)} />
        ))}
      </ul>
    </section>
  );
}

/** Фильтр по готовности эпох. */
function ReadinessFilter(props: { readonly value: EpochReadiness | null; readonly notReady: number; readonly onChange: (v: EpochReadiness | null) => void }) {
  return (
    <div className="docs-list__filters" role="group" aria-label="Готовность эпох">
      {READINESS.filter((r) => r.value !== 'not-ready' || props.notReady > 0).map((r) => (
        <Chip key={r.label} active={props.value === r.value} onClick={() => props.onChange(r.value)}>
          {r.label}
          {r.value === 'not-ready' ? ` ${props.notReady}` : ''}
        </Chip>
      ))}
    </div>
  );
}

/** Пусто справа: документ не выбран или его нет в карте. */
function NoOpenDoc(props: { readonly docPath: string | null }) {
  return (
    <p className="docs-empty docs-empty--pane" role="status">
      {props.docPath === null ? 'Выберите документ слева.' : `Документа «${props.docPath}» нет в карте: его удалили или карта снята раньше. Выберите документ слева.`}
    </p>
  );
}

/** Поиск и фильтр готовности списка. */
type DocsFilter = {
  readonly query: string;
  readonly setQuery: (q: string) => void;
  readonly readiness: EpochReadiness | null;
  readonly setReadiness: (r: EpochReadiness | null) => void;
};

/** Текстовый режим: список слева, документ справа. */
function DocsText(props: { readonly docs: DocsModel; readonly live: true | string; readonly filter: DocsFilter }) {
  const { docs } = props;
  const { query, setQuery, readiness, setReadiness } = props.filter;
  const docPath = useViewStore((s) => s.doc);
  const openDoc = useViewStore((s) => s.openDoc);
  const sections = useMemo(() => docsSections(docs, query, readiness), [docs, query, readiness]);
  const open = openDocOf(docs, docPath);
  useEffect(() => {
    document.querySelector('.docs-doc')?.scrollTo({ top: 0 });
  }, [open?.file.path]);
  const notReady = docs.epochs.filter((e) => e.readiness === 'not-ready').length;
  return (
    <div className="docs-view" data-testid="docs-view">
      <aside className="docs-list">
        <DocsModeSwitch />
        <DocsSourceLine live={props.live} />
        <Input id="docs-search" aria-label="Поиск по документации" value={query} placeholder="Эпоха, заметка, слово из текста" onChange={(ev) => setQuery(ev.target.value)} />
        <ReadinessFilter value={readiness} notReady={notReady} onChange={setReadiness} />
        <HitsSection hits={sections.hits} openDoc={openDoc} />
        <EpochsSection epochs={sections.epochs} total={docs.epochs.length} openId={open?.epoch?.id} openDoc={openDoc} />
        <FilesSection title="Заметки агентов" files={sections.notes} openPath={open?.file.path} openDoc={openDoc} />
        <FilesSection title="Руководства" files={sections.guides} openPath={open?.file.path} openDoc={openDoc} />
      </aside>
      {open === null ? <NoOpenDoc docPath={docPath} /> : <DocPane docs={docs} open={open} onOpenDoc={openDoc} writable={props.live} />}
    </div>
  );
}

/** Вид «Документация». */
export function DocsView() {
  const docs = useAppStore((s) => s.document?.docs);
  const docsMode = useViewStore((s) => s.docsMode);
  const live = useLiveDocs(docs?.root);
  // Поиск и фильтр живут здесь: переход в граф и обратно их не сбрасывает.
  const [query, setQuery] = useState('');
  const [readiness, setReadiness] = useState<EpochReadiness | null>(null);
  if (docs === undefined) {
    return (
      <EmptyView view="docs-view">
        В карте нет документации. Сканируйте с исходниками: <code>scan --code-dir &lt;корень репо&gt;</code> — в карту попадут
        docs/epoch, docs/agent-notes, CLAUDE.md и README.
      </EmptyView>
    );
  }
  if (docsMode === 'graph') {
    return (
      <div className="docs-view docs-view--graph" data-testid="docs-view">
        <DocGraphView
          switcher={
            <>
              <DocsModeSwitch />
              <DocsSourceLine live={live} />
            </>
          }
        />
      </div>
    );
  }
  return <DocsText docs={docs} live={live} filter={{ query, setQuery, readiness, setReadiness }} />;
}
