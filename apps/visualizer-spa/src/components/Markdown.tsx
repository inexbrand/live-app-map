/**
 * Markdown документа проекта: GFM (таблицы, чекбоксы), ссылки на роуты, таблицы и
 * экраны карты из `кода`, переходы между документами, картинки через dev-эндпоинт.
 */
import type { ReactNode } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { resolveDocRef, type DocRefIndex } from '@live-app-map/graph';
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

/**
 * Документ markdown.
 */
export function DocMarkdown(props: DocMarkdownProps) {
  const nav = useMapNav();
  const { refs, docPath, root, knownDocs, onOpenDoc } = props;
  return (
    <div className="md" data-testid={props.testId ?? 'doc-markdown'}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children }) {
            const text = textOf(children);
            if (className !== undefined || text === null || text.includes('\n')) {
              return <code className={className}>{children}</code>;
            }
            // `docs/agent-notes/x.md` или `09-bugs.md` — документ раздела: открывается в виде.
            const asDoc = knownDocs.has(text) ? text : resolveDocAsset(docPath, text);
            if (asDoc !== null && knownDocs.has(asDoc)) {
              return (
                <button type="button" className="md__ref" title="Открыть документ" data-testid="doc-ref-doc" onClick={() => onOpenDoc(asDoc)}>
                  <code>{children}</code>
                </button>
              );
            }
            const target = refs === null ? undefined : resolveDocRef(text, refs);
            if (target === undefined || target.kind === 'file') {
              return <code title={target === undefined ? undefined : targetTitle(target)}>{children}</code>;
            }
            return (
              <button type="button" className="md__ref" title={targetTitle(target)} data-testid="doc-ref" onClick={() => nav(target)}>
                <code>{children}</code>
              </button>
            );
          },
          a({ href, children }) {
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
            const local = resolveDocAsset(docPath, href);
            if (local !== null && knownDocs.has(local)) {
              return (
                <button type="button" className="md__link" onClick={() => onOpenDoc(local)}>
                  {children}
                </button>
              );
            }
            const target = refs === null || local === null ? undefined : resolveDocRef(local, refs);
            if (target !== undefined && target.kind !== 'file') {
              return (
                <button type="button" className="md__link" title={targetTitle(target)} onClick={() => nav(target)}>
                  {children}
                </button>
              );
            }
            return <span className="md__dead" title={href}>{children}</span>;
          },
          img({ src, alt }) {
            const local = typeof src === 'string' ? resolveDocAsset(docPath, src) : null;
            if (local === null) {
              return <span className="md__dead">{alt ?? ''}</span>;
            }
            return <img className="md__img" src={docsAssetUrl(root, local)} alt={alt ?? local} loading="lazy" />;
          },
          table({ children }) {
            return (
              <div className="md__table">
                <table>{children}</table>
              </div>
            );
          },
        }}
      >
        {props.text}
      </Markdown>
    </div>
  );
}
