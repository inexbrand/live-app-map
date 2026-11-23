/**
 * Части ноды карты, которые показывают состояние: строка пути, панель окна, стейты.
 * Нода — настоящая, из карты korbor-miniapp в public/maps.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { liveAppMapToAppMap, parseLiveAppMapDocument, type AppMapNode, type DeviceViewport } from '@live-app-map/schema';
import { renderToStaticMarkup } from 'react-dom/server';
import { BUILTIN_VIEWPORT_PRESETS } from '../../lib/viewport';
import { NodePath } from './NodePath';
import { StateChips } from './StateChips';
import { ViewportBar } from './ViewportBar';

function firstPage(): AppMapNode {
  const raw: unknown = JSON.parse(readFileSync(new URL('../../../public/maps/korbor-miniapp.liveappmap.json', import.meta.url), 'utf8'));
  const parsed = parseLiveAppMapDocument(raw);
  if (!parsed.ok) {
    throw new Error('карта korbor-miniapp не разобралась');
  }
  const page = liveAppMapToAppMap(parsed.document).nodes.find((n) => n.kind === 'page');
  if (page === undefined) {
    throw new Error('в карте нет экранов');
  }
  return page;
}

const node = firstPage();
const viewport: DeviceViewport = { width: 390, height: 844, heightMode: 'auto', label: 'phone' };
const noStatus = { unauthorized: null, cropped: null, contentHeight: null };

describe('строка пути', () => {
  test('выбранная нода без отметок: путь и размер окна, подпись пресета не повторяется', () => {
    const html = renderToStaticMarkup(<NodePath node={node} url={null} status={noStatus} openComments={0} viewport={viewport} />);
    expect(html).toContain(`title="${node.pathPattern}"`);
    expect(html).toContain(node.pathExample ?? node.pathPattern);
    expect(html).toContain('390×844 целиком');
    expect(html).not.toContain('phone');
    expect(html).not.toContain('ui-badge');
  });

  test('нода в покое: только путь, без размера окна', () => {
    const html = renderToStaticMarkup(<NodePath node={node} url={null} status={noStatus} openComments={0} viewport={null} />);
    expect(html).toContain(node.pathExample ?? node.pathPattern);
    expect(html).not.toContain('page-node__size');
    expect(html).not.toContain('×');
  });

  test('не авторизован, обрезано, замечания; служебных live и warm нет', () => {
    const status = { unauthorized: 'Не авторизован (профиль «a»): 401', cropped: 'Видно 844 из 2000 px', contentHeight: 2000 };
    const html = renderToStaticMarkup(<NodePath node={node} url="http://x/" status={status} openComments={3} viewport={{ ...viewport, heightMode: 'fixed' }} />);
    expect(html).toContain('title="http://x/"');
    expect(html).toContain('data-lam-auth="none"');
    expect(html).toContain('не авторизован');
    expect(html).toContain('data-lam-cropped="1"');
    expect(html).toContain('Видно 844 из 2000 px. Выберите ноду и нажмите «целиком»');
    expect(html).toContain('data-lam-comments="3"');
    expect(html).toContain('3 замечания');
    expect(html).not.toContain('>live<');
    expect(html).not.toContain('>warm<');
    expect(html).not.toContain('целиком<');
  });
});

describe('панель окна', () => {
  test('выбранная ширина и «целиком» отмечены', () => {
    const html = renderToStaticMarkup(<ViewportBar viewport={viewport} presets={BUILTIN_VIEWPORT_PRESETS} applyPreset={() => undefined} toggleFullHeight={() => undefined} />);
    const on = html.match(/page-node__vp-btn page-node__vp-btn--on[^>]*>([^<]*)</g) ?? [];
    const w390 = BUILTIN_VIEWPORT_PRESETS.find((p) => p.width === 390);
    expect(on.some((b) => w390 !== undefined && b.endsWith(`>${w390.label}<`))).toBe(true);
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('Сейчас: страница целиком');
  });

  test('окно с прокруткой: «целиком» не нажато', () => {
    const html = renderToStaticMarkup(<ViewportBar viewport={{ ...viewport, width: 1, heightMode: 'fixed' }} presets={BUILTIN_VIEWPORT_PRESETS} applyPreset={() => undefined} toggleFullHeight={() => undefined} />);
    expect(html).not.toContain('page-node__vp-btn--on');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('Сейчас: окно с прокруткой');
  });
});

describe('стейты', () => {
  test('роли по-русски, активный выделен, подсказка — заметка', () => {
    const states = [{ name: 'recruiter', note: 'как рекрутер' }, { name: 'employer' }, { name: 'empty' }];
    const html = renderToStaticMarkup(<StateChips states={states} activeStateName="employer" onState={() => undefined} />);
    expect(html).toContain('>рекрутер<');
    expect(html).toContain('>клиент<');
    expect(html).toContain('>empty<');
    expect(html).toContain('title="как рекрутер"');
    expect(html.match(/aria-pressed="true"/g)?.length).toBe(1);
  });
});
