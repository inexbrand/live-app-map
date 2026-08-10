/**
 * Unit-тесты embed LiveAppMap: fetch/parse success/fail и RU-копирайт UI.
 */
import { afterEach, describe, expect, mock, test } from 'bun:test';
import {
  createElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import type { AppMapDocument } from '@live-app-map/schema';
import {
  LIVE_APP_MAP_COPY,
  LiveAppMapDevtoolsPanel,
  LiveAppMapView,
  fetchAppMapDocument,
} from './index';

const CYRILLIC = /[А-Яа-яЁё]/;

type HostProps = {
  readonly children?: ReactNode;
  readonly role?: string;
  readonly className?: string;
  readonly style?: Readonly<Record<string, string | number>>;
  readonly type?: string;
  readonly onClick?: () => void;
  readonly 'data-mode'?: string;
};

/**
 * Минимальный renderer function/host-компонентов для unit-assert без react-dom.
 * Достаточен для summary/error/devtools (без useEffect).
 */
function renderTree(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return '';
  }
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map((child) => renderTree(child)).join('');
  }
  if (typeof node !== 'object' || !('type' in node) || !('props' in node)) {
    return '';
  }
  const el = node as ReactElement<HostProps>;
  const type = el.type;
  if (typeof type === 'function') {
    // Function component (LiveAppMapView / Devtools / LiveAppMap)
    const rendered = (type as (props: HostProps) => ReactNode)(el.props);
    return renderTree(rendered);
  }
  if (typeof type !== 'string') {
    return renderTree(el.props.children);
  }
  const attrs: string[] = [];
  if (el.props.role !== undefined) {
    attrs.push(`role="${el.props.role}"`);
  }
  if (el.props.className !== undefined) {
    attrs.push(`class="${el.props.className}"`);
  }
  if (el.props['data-mode'] !== undefined) {
    attrs.push(`data-mode="${el.props['data-mode']}"`);
  }
  if (el.props.type !== undefined) {
    attrs.push(`type="${el.props.type}"`);
  }
  const attrStr = attrs.length > 0 ? ` ${attrs.join(' ')}` : '';
  const inner = renderTree(el.props.children);
  return `<${type}${attrStr}>${inner}</${type}>`;
}

/** Минимальный валидный AppMapDocument (enterprise schema). */
function makeValidDocument(pageCount = 2): AppMapDocument {
  const nodes = Array.from({ length: pageCount }, (_, i) => ({
    id: `page-${i + 1}`,
    kind: 'page' as const,
    title: `Страница ${i + 1}`,
    pathPattern: `/${i + 1 === 1 ? '' : `p${i + 1}`}`,
  }));
  return {
    formatVersion: 1,
    kind: 'live-app-map',
    generatedAt: '2026-01-01T00:00:00.000Z',
    generator: { name: 'test', version: '0.0.1' },
    revision: 'rev-test',
    project: { name: 'Demo App', root: '.', framework: 'manual' },
    baseUrl: 'http://localhost:5173',
    nodes,
    edges: [
      {
        id: 'e1',
        from: 'page-1',
        to: pageCount > 1 ? 'page-2' : null,
        kind: 'link',
        confidence: 'high',
      },
    ],
  };
}

function mockFetchJson(
  body: unknown,
  init?: { readonly ok?: boolean; readonly status?: number },
) {
  const ok = init?.ok ?? true;
  const status = init?.status ?? (ok ? 200 : 500);
  return mock(() =>
    Promise.resolve({
      ok,
      status,
      json: () => Promise.resolve(body),
    }),
  );
}

afterEach(() => {
  mock.restore();
});

describe('fetchAppMapDocument (graphUrl path)', () => {
  test('валидный JSON → document с ожидаемым числом page-нод', async () => {
    const doc = makeValidDocument(3);
    globalThis.fetch = mockFetchJson(doc) as unknown as typeof fetch;

    const result = await fetchAppMapDocument('https://example.test/map.json');

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('ожидался ok');
    }
    const pages = result.document.nodes.filter((n) => n.kind === 'page').length;
    expect(pages).toBe(3);
    expect(result.document.project.name).toBe('Demo App');
  });

  test('невалидная форма → error (не silent cast)', async () => {
    globalThis.fetch = mockFetchJson({
      not: 'an-appmap',
      version: 99,
    }) as unknown as typeof fetch;

    const result = await fetchAppMapDocument('https://example.test/bad.json');

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('ожидался fail');
    }
    expect(result.error.length).toBeGreaterThan(0);
    expect(result.error).not.toBe('undefined');
    expect(result.error.toLowerCase()).not.toContain('silent');
  });

  test('network reject → error surface', async () => {
    globalThis.fetch = mock(() =>
      Promise.reject(new Error('Failed to fetch')),
    ) as unknown as typeof fetch;

    const result = await fetchAppMapDocument('https://example.test/down.json');

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('ожидался fail');
    }
    expect(result.error).toContain('Failed to fetch');
  });

  test('HTTP !ok → error без parse', async () => {
    globalThis.fetch = mockFetchJson({}, {
      ok: false,
      status: 404,
    }) as unknown as typeof fetch;

    const result = await fetchAppMapDocument('https://example.test/missing.json');

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('ожидался fail');
    }
    expect(result.error).toMatch(/404/);
    expect(CYRILLIC.test(result.error)).toBe(true);
  });
});

describe('LiveAppMapView UI (RU + pages)', () => {
  test('document → число страниц в разметке', () => {
    const doc = makeValidDocument(2);
    const html = renderTree(
      createElement(LiveAppMapView, { document: doc, error: null }),
    );
    expect(html).toContain('2');
    expect(html).toContain(LIVE_APP_MAP_COPY.pagesUnit);
    expect(html).toContain('Demo App');
    expect(CYRILLIC.test(html)).toBe(true);
  });

  test('invalid/error → текст ошибки в UI (кириллица, role=alert)', () => {
    const message = 'Required';
    const html = renderTree(
      createElement(LiveAppMapView, { document: null, error: message }),
    );
    expect(html).toContain(LIVE_APP_MAP_COPY.errorPrefix);
    expect(html).toContain(message);
    expect(html).toContain('role="alert"');
    expect(CYRILLIC.test(html)).toBe(true);
    expect(html).not.toContain('LiveAppMap error:');
  });

  test('loading → кириллическая подпись', () => {
    const html = renderTree(
      createElement(LiveAppMapView, { document: null, error: null }),
    );
    expect(html).toContain(LIVE_APP_MAP_COPY.loading);
    expect(CYRILLIC.test(LIVE_APP_MAP_COPY.loading)).toBe(true);
    expect(html).not.toContain('Loading map');
  });

  test('graphUrl success path: fetch → pages count в LiveAppMapView', async () => {
    const doc = makeValidDocument(4);
    globalThis.fetch = mockFetchJson(doc) as unknown as typeof fetch;

    const loaded = await fetchAppMapDocument('https://example.test/ok.json');
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) {
      throw new Error('ожидался ok');
    }
    const pages = loaded.document.nodes.filter((n) => n.kind === 'page').length;
    const html = renderTree(
      createElement(LiveAppMapView, {
        document: loaded.document,
        error: null,
      }),
    );
    expect(pages).toBe(4);
    expect(html).toContain(`4 ${LIVE_APP_MAP_COPY.pagesUnit}`);
  });

  test('graphUrl invalid path: fetch error → error UI text', async () => {
    globalThis.fetch = mockFetchJson({ foo: 1 }) as unknown as typeof fetch;
    const loaded = await fetchAppMapDocument('https://example.test/invalid.json');
    expect(loaded.ok).toBe(false);
    if (loaded.ok) {
      throw new Error('ожидался fail');
    }
    const html = renderTree(
      createElement(LiveAppMapView, { document: null, error: loaded.error }),
    );
    expect(html).toContain(LIVE_APP_MAP_COPY.errorPrefix);
    expect(html).toContain(loaded.error);
    expect(CYRILLIC.test(html)).toBe(true);
  });

  test('network reject → error surface в UI', async () => {
    globalThis.fetch = mock(() =>
      Promise.reject(new Error('Network offline')),
    ) as unknown as typeof fetch;
    const loaded = await fetchAppMapDocument(
      'https://example.test/offline.json',
    );
    expect(loaded.ok).toBe(false);
    if (loaded.ok) {
      throw new Error('ожидался fail');
    }
    const html = renderTree(
      createElement(LiveAppMapView, { document: null, error: loaded.error }),
    );
    expect(html).toContain('Network offline');
    expect(html).toContain(LIVE_APP_MAP_COPY.errorPrefix);
  });
});

describe('LiveAppMapView = document-prop path (LiveAppMap делегирует сюда)', () => {
  test('document → summary с pages (sync path LiveAppMap)', () => {
    const doc = makeValidDocument(2);
    const html = renderTree(
      createElement(LiveAppMapView, { document: doc, error: null }),
    );
    expect(html).toContain(`2 ${LIVE_APP_MAP_COPY.pagesUnit}`);
    expect(html).toContain('Demo App');
  });

  test('без document → loading RU', () => {
    const html = renderTree(
      createElement(LiveAppMapView, { document: null, error: null }),
    );
    expect(html).toContain(LIVE_APP_MAP_COPY.loading);
  });
});

describe('LiveAppMapDevtools RU labels', () => {
  test('кнопка «Карта приложения» (кириллица), не App Map EN', () => {
    const html = renderTree(
      createElement(LiveAppMapDevtoolsPanel, {
        open: false,
        onToggle: () => undefined,
      }),
    );
    expect(html).toContain(LIVE_APP_MAP_COPY.devtoolsOpen);
    expect(CYRILLIC.test(LIVE_APP_MAP_COPY.devtoolsOpen)).toBe(true);
    expect(html).not.toContain('>App Map<');
    expect(html).not.toContain('>Close<');
  });

  test('open → «Закрыть» и hint на русском', () => {
    const html = renderTree(
      createElement(LiveAppMapDevtoolsPanel, {
        open: true,
        onToggle: () => undefined,
      }),
    );
    expect(html).toContain(LIVE_APP_MAP_COPY.devtoolsClose);
    expect(CYRILLIC.test(LIVE_APP_MAP_COPY.devtoolsClose)).toBe(true);
    expect(html).toContain(LIVE_APP_MAP_COPY.devtoolsHint);
    expect(html).not.toContain('>Close<');
  });
});

describe('LIVE_APP_MAP_COPY', () => {
  test('все user-facing labels содержат кириллицу', () => {
    const keys = [
      'loading',
      'errorPrefix',
      'invalidJson',
      'projectFallback',
      'pagesUnit',
      'edgesUnit',
      'devtoolsOpen',
      'devtoolsClose',
      'devtoolsHint',
    ] as const;
    for (const key of keys) {
      expect(CYRILLIC.test(LIVE_APP_MAP_COPY[key])).toBe(true);
    }
  });
});
