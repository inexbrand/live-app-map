/**
 * Embed API (@live-app-map/react).
 * Полноценный canvas — apps/visualizer-spa; здесь headless hooks + Devtools shell.
 */
import { parseAppMapDocument, type AppMapDocument } from '@live-app-map/schema';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';

/** Пользовательские строки UI (кириллица). */
export const LIVE_APP_MAP_COPY = {
  loading: 'Загрузка карты…',
  errorPrefix: 'Ошибка LiveAppMap: ',
  invalidJson: 'Невалидный AppMap JSON',
  projectFallback: 'Карта приложения',
  pagesUnit: 'страниц',
  edgesUnit: 'рёбер',
  baseUrlLabel: 'baseUrl',
  devtoolsOpen: 'Карта приложения',
  devtoolsClose: 'Закрыть',
  devtoolsHint:
    'Live App Map Devtools — откройте standalone SPA на :4310 или передайте graphUrl в <LiveAppMap />.',
} as const;

export type LiveAppMapProps = {
  readonly document?: AppMapDocument;
  readonly graphUrl?: string;
  readonly mode?: 'live' | 'map-only' | 'compact';
  readonly baseUrl?: string;
  readonly className?: string;
  readonly children?: ReactNode;
};

export type FetchAppMapResult =
  | { readonly ok: true; readonly document: AppMapDocument }
  | { readonly ok: false; readonly error: string };

/**
 * Загружает graph JSON по URL и валидирует через parseAppMapDocument.
 * Граница сети/схемы для embed LiveAppMap (без silent cast).
 *
 * @param graphUrl - URL документа AppMap / live-app-map
 * @returns Успешный document либо текст ошибки для UI
 */
export async function fetchAppMapDocument(graphUrl: string): Promise<FetchAppMapResult> {
  try {
    const response = await fetch(graphUrl);
    if (!response.ok) {
      return {
        ok: false,
        error: `HTTP ${response.status}: не удалось загрузить карту`,
      };
    }
    const json: unknown = await response.json();
    const parsed = parseAppMapDocument(json);
    if (parsed.ok) {
      return { ok: true, document: parsed.document };
    }
    return {
      ok: false,
      error: parsed.errors[0]?.message ?? LIVE_APP_MAP_COPY.invalidJson,
    };
  } catch (err: unknown) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Презентационный слой embed: loading / error / summary по document.
 * Вынесен для unit-тестов без DOM effects.
 */
export function LiveAppMapView(props: {
  readonly document: AppMapDocument | null;
  readonly error: string | null;
  readonly mode?: LiveAppMapProps['mode'];
  readonly baseUrl?: string;
  readonly className?: string;
  readonly children?: ReactNode;
}) {
  if (props.error !== null) {
    return (
      <div className={props.className} role="alert">
        {LIVE_APP_MAP_COPY.errorPrefix}
        {props.error}
      </div>
    );
  }
  if (props.document === null) {
    return <div className={props.className}>{LIVE_APP_MAP_COPY.loading}</div>;
  }
  const pages = props.document.nodes.filter((n) => n.kind === 'page').length;
  return (
    <div className={props.className} data-mode={props.mode ?? 'map-only'}>
      <strong>{props.document.project.name ?? LIVE_APP_MAP_COPY.projectFallback}</strong>
      <div>
        {pages} {LIVE_APP_MAP_COPY.pagesUnit} · {props.document.edges.length}{' '}
        {LIVE_APP_MAP_COPY.edgesUnit} · {LIVE_APP_MAP_COPY.baseUrlLabel}{' '}
        {props.baseUrl ?? props.document.baseUrl ?? '—'}
      </div>
      {props.children}
    </div>
  );
}

/**
 * Минимальный embed: загружает graph JSON и рендерит summary (SPA — полный UI).
 */
export function LiveAppMap(props: LiveAppMapProps) {
  const [doc, setDoc] = useState<AppMapDocument | null>(props.document ?? null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (props.document) {
      setDoc(props.document);
      setError(null);
      return;
    }
    if (!props.graphUrl) {
      return;
    }
    let cancelled = false;
    void fetchAppMapDocument(props.graphUrl).then((result) => {
      if (cancelled) {
        return;
      }
      if (result.ok) {
        setDoc(result.document);
        setError(null);
        return;
      }
      setDoc(null);
      setError(result.error);
    });
    return () => {
      cancelled = true;
    };
  }, [props.document, props.graphUrl]);

  return (
    <LiveAppMapView
      document={doc}
      error={error}
      mode={props.mode}
      baseUrl={props.baseUrl}
      className={props.className}
    >
      {props.children}
    </LiveAppMapView>
  );
}

export type DevtoolsProps = {
  readonly initialIsOpen?: boolean;
  readonly position?: 'bottom-right' | 'bottom-left';
};

/**
 * Плавающая кнопка Devtools (открыть SPA или in-app panel). Только non-production.
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
  const buttonStyle: CSSProperties = {
    minWidth: 44,
    minHeight: 44,
    padding: '8px 12px',
    cursor: 'pointer',
  };
  return (
    <div style={style}>
      <button type="button" style={buttonStyle} onClick={() => setOpen((v) => !v)}>
        {open ? LIVE_APP_MAP_COPY.devtoolsClose : LIVE_APP_MAP_COPY.devtoolsOpen}
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
          {LIVE_APP_MAP_COPY.devtoolsHint}
        </div>
      ) : null}
    </div>
  );
}
