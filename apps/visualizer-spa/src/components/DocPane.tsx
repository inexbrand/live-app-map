/**
 * Документ вида «Документация»: шапка эпохи или файла, вкладки файлов эпохи, текст,
 * отметки 09-bugs, скриншоты, локальный граф связей.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { Check, Link2, X } from 'lucide-react';
import { buildCodeIndex, buildDocRefIndex } from '@live-app-map/graph';
import { bugItems } from '@live-app-map/scanner-docs/bugs';
import type { DocEpoch, DocFile, DocsModel } from '@live-app-map/schema';
import { docsAssetUrl } from '../lib/docs-asset-url';
import { epochDateLabel, epochFileLabel, galleryImages, readinessLabel, type OpenDoc } from '../lib/docs-view-model';
import { useAppStore } from '../store/app-store';
import { BugMarks } from './BugMarks';
import { LocalGraph } from './graph/LocalGraph';
import { DocMarkdown } from './Markdown';
import { Button } from '@/components/ui/button';

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

/** Сколько открытых пунктов показать в шапке сразу. */
const BUGS_SHOWN = 5;

/** Шапка эпохи: дата, статус, готовность, цель, открытые пункты. */
function EpochHead(props: { readonly epoch: DocEpoch; readonly links: ReactNode; readonly showBugs: boolean; readonly renderBugs: (text: string) => ReactNode }) {
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
        {[epochDateLabel(e.date), e.declaredStatus === undefined ? '' : `статус: ${e.declaredStatus}`, e.readiness === 'ready' ? '' : readinessLabel(e)]
          .filter((s) => s !== '')
          .join(' · ')}
      </p>
      {e.summary === undefined ? null : <p className="docs-doc__summary">{e.summary}</p>}
      {e.openBugs.length === 0 || !props.showBugs ? null : (
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

/** Ссылки документов в карту (экраны, роуты, таблицы). */
function useDocRefs() {
  const mapDocument = useAppStore((s) => s.document);
  return useMemo(
    () => (mapDocument === null ? null : buildDocRefIndex(mapDocument, mapDocument.code === undefined ? undefined : buildCodeIndex(mapDocument))),
    [mapDocument],
  );
}

/** Все пути документов раздела docs. */
function docPaths(docs: DocsModel): Set<string> {
  return new Set([...docs.epochs.flatMap((e) => e.files.map((f) => f.path)), ...docs.notes.map((f) => f.path), ...docs.guides.map((f) => f.path)]);
}

/** Отрисовка markdown документа с путём и необязательным testId. */
type RenderMd = (text: string, path: string, testId?: string) => ReactNode;

/** Шапка заметки или руководства: заголовок, ссылка, путь. */
function FileHead(props: { readonly file: DocFile }) {
  return (
    <header className="docs-doc__head">
      <div className="docs-doc__title">
        <h2>{props.file.title}</h2>
        <CopyLink />
      </div>
      <p className="docs-doc__meta">{props.file.path}</p>
    </header>
  );
}

/** Вкладки файлов эпохи. */
function EpochTabs(props: { readonly epoch: DocEpoch; readonly current: string; readonly onOpenDoc: (path: string) => void }) {
  const e = props.epoch;
  return (
    <nav className="docs-tabs" aria-label="Файлы эпохи">
      {e.files.map((f) => (
        <button
          key={f.path}
          type="button"
          className={`docs-tab${f.path === props.current ? ' docs-tab--on' : ''}`}
          title={f.path.slice(e.dir.length + 1)}
          aria-current={f.path === props.current}
          onClick={() => props.onOpenDoc(f.path)}
        >
          {epochFileLabel(e.dir, f.path)}
        </button>
      ))}
    </nav>
  );
}

/** Открыт файл 09-bugs эпохи с пунктами: их показывает блок «Пункты». */
function isBugsWithItems(e: DocEpoch, file: DocFile): boolean {
  return file.path === `${e.dir}/09-bugs.md` && bugItems(file.text).length > 0;
}

/** Файл эпохи: отметки 09-bugs (тогда текст файла свёрнут), текст, скриншоты. Имя файла — во вкладке. */
function EpochBody(props: { readonly docs: DocsModel; readonly epoch: DocEpoch; readonly file: DocFile; readonly writable: true | string; readonly md: RenderMd; readonly onZoom: (src: string) => void }) {
  const { docs, epoch: e, file } = props;
  const bugs = isBugsWithItems(e, file);
  return (
    <article className="docs-doc__body">
      {bugs ? <BugMarks key={e.id} docs={docs} epoch={e} file={file} writable={props.writable} /> : null}
      {bugs ? (
        <details className="docs-doc__raw">
          <summary>Текст файла</summary>
          <DocText file={file} md={props.md} />
        </details>
      ) : (
        <DocText file={file} md={props.md} />
      )}
      <Gallery root={docs.root} images={galleryImages(e.images, file.path, file.text)} onOpen={props.onZoom} />
    </article>
  );
}

/** Текст без первого заголовка «# …»: документ уже назван шапкой и вкладкой. */
export function withoutLeadingH1(text: string): string {
  return text.replace(/^\s*# [^\n]*\n?/, '');
}

/** Текст документа; пустой файл — подсказка. */
function DocText(props: { readonly file: DocFile; readonly md: RenderMd }) {
  return props.file.text.trim() === '' ? <p className="docs-empty">Файл пуст — в нём ещё ничего не записано.</p> : <>{props.md(withoutLeadingH1(props.file.text), props.file.path)}</>;
}

/** Картинка во весь экран; клик или «Закрыть» — закрыть. */
function Zoom(props: { readonly root: string; readonly src: string; readonly onClose: () => void }) {
  return (
    <div className="docs-zoom" role="dialog" aria-label={props.src} onClick={props.onClose}>
      <img src={docsAssetUrl(props.root, props.src)} alt={props.src} />
      <Button type="button" size="icon-sm" variant="ghost" className="docs-zoom__close" aria-label="Закрыть" onClick={props.onClose}>
        <X size={16} />
      </Button>
    </div>
  );
}

/** Правая часть: шапка, вкладки файлов эпохи, документ, скриншоты. */
export function DocPane(props: { readonly docs: DocsModel; readonly open: OpenDoc; readonly onOpenDoc: (path: string) => void; readonly writable: true | string }) {
  const { docs, open } = props;
  const refs = useDocRefs();
  const knownDocs = useMemo(() => docPaths(docs), [docs]);
  const [zoom, setZoom] = useState<string | null>(null);
  const e = open.epoch;
  const md: RenderMd = (text, path, testId) => (
    <DocMarkdown text={text} docPath={path} root={docs.root} refs={refs} knownDocs={knownDocs} onOpenDoc={props.onOpenDoc} testId={testId} />
  );
  return (
    <main className="docs-doc" data-testid="docs-doc">
      <div className="docs-doc__layout">
      <div className="docs-doc__main">
      {e === undefined ? (
        <>
          <FileHead file={open.file} />
          <article className="docs-doc__body">
            <DocText file={open.file} md={md} />
          </article>
        </>
      ) : (
        <>
          <EpochHead key={e.id} epoch={e} links={<CopyLink />} showBugs={!isBugsWithItems(e, open.file)} renderBugs={(text) => md(text, `${e.dir}/09-bugs.md`, 'docs-open-bugs-md')} />
          <EpochTabs epoch={e} current={open.file.path} onOpenDoc={props.onOpenDoc} />
          <EpochBody docs={docs} epoch={e} file={open.file} writable={props.writable} md={md} onZoom={setZoom} />
        </>
      )}
      </div>
      <LocalGraph docPath={open.file.path} />
      </div>
      {zoom === null ? null : <Zoom root={docs.root} src={zoom} onClose={() => setZoom(null)} />}
    </main>
  );
}

