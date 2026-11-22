/**
 * Markdown документа проекта: GFM (таблицы, чекбоксы), ссылки на роуты, таблицы и
 * экраны карты из `кода`, переходы между документами, картинки через dev-эндпоинт.
 */
import type { ReactNode } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { resolveDocRef, type DocRefIndex, type DocTarget } from '@live-app-map/graph';
import { docsAssetUrl } from '../lib/docs-asset-url';
import { resolveDocAsset } from '../lib/docs-view-model';
import { targetTitle, useMapNav } from '../lib/use-map-nav';

/** Свойства документа. */
export type DocMarkdownProps = {
  readonly text: string;
  /** Путь документа от корня — для относительных ссылок и картинок. */
  readonly docPath: string;
  /** Корень проекта (docs.root). */
  readonly root: string;
  readonly refs: DocRefIndex | null;
  /** Пути документов раздела docs — ссылки на них открываются внутри вида. */
  readonly knownDocs: ReadonlySet<string>;
  readonly onOpenDoc: (path: string) => void;
  /** data-testid обёртки: у фрагментов (открытые пункты эпохи) — свой. */
  readonly testId?: string;
};

/** Текст узла children, если это строка. */
function textOf(children: ReactNode): string | null {
  if (typeof children === 'string') {
    return children;
  }
  if (Array.isArray(children) && children.every((c) => typeof c === 'string')) {
    return children.join('');
  }
  return null;
}

/** Что нужно ссылкам документа: где он, что есть в разделе docs и в карте. */
type MdContext = Pick<DocMarkdownProps, 'refs' | 'docPath' | 'root' | 'knownDocs' | 'onOpenDoc'>;

/** Путь документа раздела по тексту `кода` (как есть или относительно документа). */
function docOfCode(text: string, ctx: MdContext): string | null {
  const asDoc = ctx.knownDocs.has(text) ? text : resolveDocAsset(ctx.docPath, text);
  return asDoc !== null && ctx.knownDocs.has(asDoc) ? asDoc : null;
}

/** Место карты по тексту ссылки; файлы — не место (их не открыть). */
function placeOf(text: string | null, refs: DocRefIndex | null): DocTarget | undefined {
  return refs === null || text === null ? undefined : resolveDocRef(text, refs);
}

/** Инлайн-код: документ раздела или место карты — кнопкой, иначе код (с подсказкой файла). */
function CodeRef(props: { readonly className: string | undefined; readonly children: ReactNode; readonly ctx: MdContext }) {
  const nav = useMapNav();
  const { className, children, ctx } = props;
  const text = textOf(children);
  if (className !== undefined || text === null || text.includes('\n')) {
    return <code className={className}>{children}</code>;
  }
  // `docs/agent-notes/x.md` или `09-bugs.md` — документ раздела: открывается в виде.
  const asDoc = docOfCode(text, ctx);
  if (asDoc !== null) {
    return (
      <button type="button" className="md__ref" title="Открыть документ" data-testid="doc-ref-doc" onClick={() => ctx.onOpenDoc(asDoc)}>
        <code>{children}</code>
      </button>
    );
  }
  const target = placeOf(text, ctx.refs);
  if (target === undefined || target.kind === 'file') {
    return <code title={target === undefined ? undefined : targetTitle(target)}>{children}</code>;
  }
  return (
    <button type="button" className="md__ref" title={targetTitle(target)} data-testid="doc-ref" onClick={() => nav(target)}>
      <code>{children}</code>
    </button>
  );
}

/** Ссылка: внешняя — в новой вкладке, документ раздела или место карты — кнопкой, иначе мёртвая. */
function DocLink(props: { readonly href: string | undefined; readonly children: ReactNode; readonly ctx: MdContext }) {
  const nav = useMapNav();
  const { href, children, ctx } = props;
  if (href === undefined) {
    return <span>{children}</span>;
  }
  if (/^https?:/i.test(href)) {
    return (
      <a href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    );
  }
  const local = resolveDocAsset(ctx.docPath, href);
  if (local !== null && ctx.knownDocs.has(local)) {
    return (
      <button type="button" className="md__link" onClick={() => ctx.onOpenDoc(local)}>
        {children}
      </button>
    );
  }
  const target = placeOf(local, ctx.refs);
  if (target !== undefined && target.kind !== 'file') {
    return (
      <button type="button" className="md__link" title={targetTitle(target)} onClick={() => nav(target)}>
        {children}
      </button>
    );
  }
  return <span className="md__dead" title={href}>{children}</span>;
}

/** Картинка документа через dev-эндпоинт; вне проекта — подпись. */
function DocImage(props: { readonly src: unknown; readonly alt: string | undefined; readonly ctx: MdContext }) {
  const local = typeof props.src === 'string' ? resolveDocAsset(props.ctx.docPath, props.src) : null;
  if (local === null) {
    return <span className="md__dead">{props.alt ?? ''}</span>;
  }
  return <img className="md__img" src={docsAssetUrl(props.ctx.root, local)} alt={props.alt ?? local} loading="lazy" />;
}

/** Компоненты react-markdown для документа. */
function markdownComponents(ctx: MdContext): Components {
  return {
    code: ({ className, children }) => <CodeRef className={className} ctx={ctx}>{children}</CodeRef>,
    a: ({ href, children }) => <DocLink href={href} ctx={ctx}>{children}</DocLink>,
    img: ({ src, alt }) => <DocImage src={src} alt={alt} ctx={ctx} />,
    table: ({ children }) => (
      <div className="md__table">
        <table>{children}</table>
      </div>
    ),
  };
}

/**
 * Документ markdown.
 */
export function DocMarkdown(props: DocMarkdownProps) {
  const { refs, docPath, root, knownDocs, onOpenDoc } = props;
  return (
    <div className="md" data-testid={props.testId ?? 'doc-markdown'}>
      <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents({ refs, docPath, root, knownDocs, onOpenDoc })}>
        {props.text}
      </Markdown>
    </div>
  );
}
