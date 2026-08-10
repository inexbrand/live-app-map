/**
 * Embed API (@live-app-map/react).
 * Полноценный canvas — apps/visualizer-spa; здесь headless hooks + Devtools shell.
 */
import type { AppMapDocument } from '@live-app-map/schema';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';

export type LiveAppMapProps = {
  readonly document?: AppMapDocument;
  readonly graphUrl?: string;
  readonly mode?: 'live' | 'map-only' | 'compact';
  readonly baseUrl?: string;
  readonly className?: string;
  readonly children?: ReactNode;
};

/**
 * Минимальный embed: загружает graph JSON и рендерит summary (SPA — полный UI).
 */
export function LiveAppMap(props: LiveAppMapProps) {
  const [doc, setDoc] = useState<AppMapDocument | null>(props.document ?? null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (props.document) {
      setDoc(props.document);
      return;
    }
    if (!props.graphUrl) {
      return;
    }
    let cancelled = false;
    void fetch(props.graphUrl)
      .then((r) => r.json())
      .then((json: unknown) => {
        if (!cancelled) {
          setDoc(json as AppMapDocument);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [props.document, props.graphUrl]);

  if (error) {
    return <div className={props.className}>LiveAppMap error: {error}</div>;
  }
  if (!doc) {
    return <div className={props.className}>Loading map…</div>;
  }
  const pages = doc.nodes.filter((n) => n.kind === 'page').length;
  return (
    <div className={props.className} data-mode={props.mode ?? 'map-only'}>
      <strong>{doc.project.name ?? 'App map'}</strong>
      <div>
        {pages} pages · {doc.edges.length} edges · baseUrl{' '}
        {props.baseUrl ?? doc.baseUrl ?? '—'}
      </div>
      {props.children}
    </div>
  );
}

export type DevtoolsProps = {
  readonly initialIsOpen?: boolean;
  readonly position?: 'bottom-right' | 'bottom-left';
};

/**
 * Floating Devtools button (open SPA or in-app panel).
 */
export function LiveAppMapDevtools(props: DevtoolsProps) {
  const [open, setOpen] = useState(props.initialIsOpen ?? false);
  if (process.env.NODE_ENV === 'production') {
    return null;
  }
  const style: CSSProperties = {
    position: 'fixed',
    bottom: 16,
    [props.position === 'bottom-left' ? 'left' : 'right']: 16,
    zIndex: 99999,
  };
  return (
    <div style={style}>
      <button type="button" onClick={() => setOpen((v) => !v)}>
        {open ? 'Close' : 'App Map'}
      </button>
      {open ? (
        <div
          style={{
            marginTop: 8,
            width: 320,
            padding: 12,
            background: '#12151c',
            color: '#e8ecf4',
            borderRadius: 12,
            border: '1px solid #2a3140',
          }}
        >
          Live App Map Devtools — откройте standalone SPA на :4310 или передайте
          graphUrl в {'<LiveAppMap />'}.
        </div>
      ) : null}
    </div>
  );
}
