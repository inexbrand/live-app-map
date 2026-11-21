/**
 * Вид «Документация»: эпохи задач (дата, цель, статус, готовность по 09-bugs),
 * заметки агентов и руководства; документ markdown со ссылками в карту и скриншотами эпохи.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Check, Link2, X } from 'lucide-react';
import { buildCodeIndex, buildDocRefIndex, type DocRefIndex } from '@live-app-map/graph';
import type { DocEpoch, DocFile, DocsModel, EpochReadiness } from '@live-app-map/schema';
import { docsAssetUrl } from '../lib/docs-asset-url';
import {
  docsSections,
  epochDateLabel,
  epochFileLabel,
  galleryImages,
  openDocOf,
  readinessLabel,
  type OpenDoc,
} from '../lib/docs-view-model';
import { useAppStore } from '../store/app-store';
import { useViewStore } from '../store/view-store';
import { Button, Chip, Input } from '../ui';
import { DocMarkdown } from './Markdown';
import { DocGraphView } from './graph/DocGraphView';
import { LocalGraph } from './graph/LocalGraph';

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

/** Кнопка «Скопировать ссылку» на открытое место (адрес страницы хранит документ). */
function CopyLink() {
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      onClick={() => {
        void navigator.clipboard?.writeText(window.location.href).then(() => {
          setDone(true);
          window.setTimeout(() => setDone(false), 1600);
        });
      }}
      title="Ссылка на этот документ"
    >
      {done ? <Check size={16} /> : <Link2 size={16} />}
      {done ? 'Скопировано' : 'Ссылка'}
    </Button>
  );
}

const READINESS: readonly { value: EpochReadiness | null; label: string }[] = [
  { value: null, label: 'Все' },
  { value: 'not-ready', label: 'Не готово' },
  { value: 'ready', label: 'Готово' },
  { value: 'no-bugs-file', label: 'Без 09-bugs' },
];

/** Сколько открытых пунктов показать в шапке сразу. */
const BUGS_SHOWN = 5;

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
        <span className={`docs-row__state${e.readiness === 'not-ready' ? ' docs-row__state--open' : ''}`}>{readinessLabel(e)}</span>
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

/** Шапка эпохи: дата, статус, готовность, цель, открытые пункты. */
function EpochHead(props: { readonly epoch: DocEpoch; readonly links: ReactNode; readonly renderBugs: (text: string) => ReactNode }) {
  const e = props.epoch;
  const [allBugs, setAllBugs] = useState(false);
  const bugs = allBugs ? e.openBugs : e.openBugs.slice(0, BUGS_SHOWN);
  return (
    <header className="docs-doc__head" data-testid="docs-epoch-head">
      <div className="docs-doc__title">
        <h2>{e.slug}</h2>
        {props.links}
      </div>
      <p className="docs-doc__meta">
        {[epochDateLabel(e.date), e.declaredStatus === undefined ? '' : `статус: ${e.declaredStatus}`, readinessLabel(e)]
          .filter((s) => s !== '')
          .join(' · ')}
      </p>
      {e.summary === undefined ? null : <p className="docs-doc__summary">{e.summary}</p>}
      {e.openBugs.length === 0 ? null : (
        <div className="docs-doc__bugs" data-testid="docs-open-bugs">
          <h3>
            Открытые пункты <span className="docs-count">{e.openBugs.length}</span>
          </h3>
          {props.renderBugs(bugs.map((b) => `- ${b}`).join('\n'))}
          {e.openBugs.length > BUGS_SHOWN && !allBugs ? (
            <Button type="button" size="sm" variant="ghost" onClick={() => setAllBugs(true)}>
              ещё {e.openBugs.length - BUGS_SHOWN}
            </Button>
          ) : null}
        </div>
      )}
    </header>
  );
}

/** Картинки эпохи, которых нет в тексте открытого файла, — сеткой; клик — во весь экран. */
function Gallery(props: { readonly root: string; readonly images: readonly string[]; readonly onOpen: (src: string) => void }) {
  if (props.images.length === 0) {
    return null;
  }
  return (
    <section className="docs-gallery" data-testid="docs-gallery">
      <h3>
        Скриншоты эпохи <span className="docs-count">{props.images.length}</span>
      </h3>
      <div className="docs-gallery__grid">
        {props.images.map((img) => (
          <button key={img} type="button" className="docs-gallery__item" onClick={() => props.onOpen(img)} title={img}>
            <img src={docsAssetUrl(props.root, img)} alt={img.split('/').pop() ?? img} loading="lazy" />
            <span>{img.split('/').pop()}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

/** Правая часть: шапка, вкладки файлов эпохи, документ, скриншоты. */
function DocPane(props: { readonly docs: DocsModel; readonly open: OpenDoc; readonly onOpenDoc: (path: string) => void }) {
  const { docs, open } = props;
  const mapDocument = useAppStore((s) => s.document);
  const refs = useMemo(
    () => (mapDocument === null ? null : buildDocRefIndex(mapDocument, mapDocument.code === undefined ? undefined : buildCodeIndex(mapDocument))),
    [mapDocument],
  );
  const knownDocs = useMemo(
    () => new Set([...docs.epochs.flatMap((e) => e.files.map((f) => f.path)), ...docs.notes.map((f) => f.path), ...docs.guides.map((f) => f.path)]),
    [docs],
  );
  const [zoom, setZoom] = useState<string | null>(null);
  const e = open.epoch;
  const md = (text: string, path: string): ReactNode => (
    <DocMarkdown text={text} docPath={path} root={docs.root} refs={refs} knownDocs={knownDocs} onOpenDoc={props.onOpenDoc} />
  );
  return (
    <main className="docs-doc" data-testid="docs-doc">
      <div className="docs-doc__layout">
      <div className="docs-doc__main">
      {e === undefined ? (
        <header className="docs-doc__head">
          <div className="docs-doc__title">
            <h2>{open.file.title}</h2>
            <CopyLink />
          </div>
          <p className="docs-doc__meta">{open.file.path}</p>
        </header>
      ) : (
        <EpochHead key={e.id} epoch={e} links={<CopyLink />} renderBugs={(text) => md(text, `${e.dir}/09-bugs.md`)} />
      )}
      {e === undefined ? null : (
        <nav className="docs-tabs" aria-label="Файлы эпохи">
          {e.files.map((f) => (
            <button
              key={f.path}
              type="button"
              className={`docs-tab${f.path === open.file.path ? ' docs-tab--on' : ''}`}
              title={f.path.slice(e.dir.length + 1)}
              aria-current={f.path === open.file.path}
              onClick={() => props.onOpenDoc(f.path)}
            >
              {epochFileLabel(e.dir, f.path)}
            </button>
          ))}
        </nav>
      )}
      <article className="docs-doc__body">
        {e === undefined ? null : <p className="docs-doc__file">{open.file.path.slice(e.dir.length + 1)}</p>}
        {open.file.text.trim() === '' ? <p className="docs-empty">Файл пуст — в нём ещё ничего не записано.</p> : md(open.file.text, open.file.path)}
        {e === undefined ? null : (
          <Gallery root={docs.root} images={galleryImages(e.images, open.file.path, open.file.text)} onOpen={setZoom} />
        )}
      </article>
      </div>
      <LocalGraph docPath={open.file.path} />
      </div>
      {zoom === null ? null : (
        <div className="docs-zoom" role="dialog" aria-label={zoom} onClick={() => setZoom(null)}>
          <img src={docsAssetUrl(docs.root, zoom)} alt={zoom} />
          <Button type="button" size="icon-sm" variant="ghost" className="docs-zoom__close" aria-label="Закрыть" onClick={() => setZoom(null)}>
            <X size={16} />
          </Button>
        </div>
      )}
    </main>
  );
}

/** Вид «Документация». */
export function DocsView() {
  const docs = useAppStore((s) => s.document?.docs);
  const docPath = useViewStore((s) => s.doc);
  const openDoc = useViewStore((s) => s.openDoc);
  const docsMode = useViewStore((s) => s.docsMode);
  const [query, setQuery] = useState('');
  const [readiness, setReadiness] = useState<EpochReadiness | null>(null);
  const sections = useMemo(() => (docs === undefined ? null : docsSections(docs, query, readiness)), [docs, query, readiness]);
  const open = docs === undefined ? null : openDocOf(docs, docPath);
  useEffect(() => {
    document.querySelector('.docs-doc')?.scrollTo({ top: 0 });
  }, [open?.file.path]);

  if (docs === undefined || sections === null) {
    return (
      <div className="docs-view docs-view--empty" data-testid="docs-view">
        <p>
          В карте нет документации. Сканируйте с исходниками: <code>scan --code-dir &lt;корень репо&gt;</code> — в карту попадут
          docs/epoch, docs/agent-notes, CLAUDE.md и README.
        </p>
      </div>
    );
  }
  const notReady = docs.epochs.filter((e) => e.readiness === 'not-ready').length;
  if (docsMode === 'graph') {
    return (
      <div className="docs-view docs-view--graph" data-testid="docs-view">
        <DocGraphView switcher={<DocsModeSwitch />} />
      </div>
    );
  }
  return (
    <div className="docs-view" data-testid="docs-view">
      <aside className="docs-list">
        <DocsModeSwitch />
        <Input id="docs-search" aria-label="Поиск по документации" value={query} placeholder="Эпоха, заметка, слово из текста" onChange={(ev) => setQuery(ev.target.value)} />
        <div className="docs-list__filters" role="group" aria-label="Готовность эпох">
          {READINESS.map((r) => (
            <Chip key={r.label} active={readiness === r.value} onClick={() => setReadiness(r.value)}>
              {r.label}
              {r.value === 'not-ready' ? ` ${notReady}` : ''}
            </Chip>
          ))}
        </div>
        {sections.hits.length === 0 ? null : (
          <section className="docs-group">
            <h3 className="docs-group__title">
              Совпадения в тексте <span className="docs-count">{sections.hits.length}</span>
            </h3>
            <ul>
              {sections.hits.map((h) => (
                <li key={`${h.path}:${h.line}`}>
                  <button type="button" className="docs-row" onClick={() => openDoc(h.path)} data-testid="docs-hit">
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
        )}
        <section className="docs-group">
          <h3 className="docs-group__title">
            Эпохи <span className="docs-count">{sections.epochs.length}</span>
          </h3>
          {sections.epochs.length === 0 ? <p className="docs-empty">{docs.epochs.length === 0 ? 'В проекте нет docs/epoch.' : 'Ничего не найдено.'}</p> : null}
          <ul>
            {sections.epochs.map((e) => (
              <EpochRow key={e.id} epoch={e} active={open?.epoch?.id === e.id} onOpen={() => openDoc(e.dir)} />
            ))}
          </ul>
        </section>
        {sections.notes.length === 0 ? null : (
          <section className="docs-group">
            <h3 className="docs-group__title">
              Заметки агентов <span className="docs-count">{sections.notes.length}</span>
            </h3>
            <ul>
              {sections.notes.map((f) => (
                <FileRow key={f.path} file={f} active={open?.file.path === f.path} onOpen={() => openDoc(f.path)} />
              ))}
            </ul>
          </section>
        )}
        {sections.guides.length === 0 ? null : (
          <section className="docs-group">
            <h3 className="docs-group__title">
              Руководства <span className="docs-count">{sections.guides.length}</span>
            </h3>
            <ul>
              {sections.guides.map((f) => (
                <FileRow key={f.path} file={f} active={open?.file.path === f.path} onOpen={() => openDoc(f.path)} />
              ))}
            </ul>
          </section>
        )}
      </aside>
      {open === null ? (
        <p className="docs-empty docs-empty--pane" role="status">
          {docPath === null ? 'Выберите документ слева.' : `Документа «${docPath}» нет в карте: его удалили или карта снята раньше. Выберите документ слева.`}
        </p>
      ) : (
        <DocPane docs={docs} open={open} onOpenDoc={openDoc} />
      )}
    </div>
  );
}
