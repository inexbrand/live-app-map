/**
 * Стор галереи: разбор ответа /__lam_project/states настоящего HTTP-сервера.
 */
import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { useComponentsStore } from './components-store';

const apps = [{ id: 'miniapp', label: 'Мини-приложение', dir: 'apps/miniapp', baseUrl: 'https://vite.localhost:5175' }];
const components = {
  'apps/miniapp/src/shared/ui/Button.tsx#Button': [{ id: 'primary', label: 'Основная' }, { id: 'ghost', label: 'Тихая' }],
  'apps/miniapp/src/feed/Card.tsx#Card': [{ id: 'empty', label: 'Пустая' }],
  'packages/x/Y.tsx#Y': [{ id: 'a', label: 'А' }],
};

/** Проект: /ok — всё есть, /no-apps — config без apps, иначе — проект не открыт. */
const server = Bun.serve({
  port: 0,
  fetch(req) {
    const p = new URL(req.url).pathname;
    if (p === '/ok/__lam_project/states' || p === '/no-apps/__lam_project/states') return Response.json({ screens: {}, components });
    if (p === '/ok/__lam_project/config') return Response.json({ name: 'p', apps });
    if (p === '/no-apps/__lam_project/config') return Response.json({ name: 'p' });
    if (p === '/spa/__lam_project/config') return new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } });
    return new Response('проект не открыт: запустите bun run dev -- --project <каталог>', { status: 404 });
  },
});
afterAll(() => server.stop(true));

/** Настоящий HTTP-запрос к серверу проекта с префиксом сценария. */
const realFetchJson = (prefix: string) => async (url: string): Promise<unknown> => {
  const res = await fetch('http://127.0.0.1:' + server.port + prefix + url);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
};

beforeEach(() => useComponentsStore.setState({ status: 'idle', error: null, gallery: { groups: [], problems: [] }, visible: new Set() }));

describe('стор галереи', () => {
  test('ответ проекта → группы и проблемы', async () => {
    await useComponentsStore.getState().load(realFetchJson('/ok'));
    const s = useComponentsStore.getState();
    expect(s.status).toBe('ready');
    expect(s.gallery.groups.map((g) => g.folder)).toEqual(['src/feed', 'src/shared/ui']);
    expect(s.gallery.problems).toEqual(['packages/x/Y.tsx#Y: файл не внутри приложений config.ts (apps/miniapp)']);
  });
  test('нет apps или проект не открыт — ошибка с подсказкой', async () => {
    await useComponentsStore.getState().load(realFetchJson('/no-apps'));
    expect(useComponentsStore.getState().error).toBe('в ответе /__lam_project/config нет apps — приложения из .live-app-map/config.ts');
    useComponentsStore.setState({ status: 'idle' });
    await useComponentsStore.getState().load(realFetchJson('/nope'));
    expect(useComponentsStore.getState().error).toBe('проект не открыт: запустите bun run dev -- --project <каталог>');
  });
});

describe('открыт ли проект', () => {
  const probe = (prefix: string) => (url: string) => fetch('http://127.0.0.1:' + server.port + prefix + url);
  test('config JSON 200 — открыт; 404 и index.html — нет; сеть упала — нет', async () => {
    await useComponentsStore.getState().probeProject(probe('/ok'));
    expect(useComponentsStore.getState().projectOpen).toBe(true);
    await useComponentsStore.getState().probeProject(probe('/nope'));
    expect(useComponentsStore.getState().projectOpen).toBe(false);
    await useComponentsStore.getState().probeProject(probe('/spa'));
    expect(useComponentsStore.getState().projectOpen).toBe(false);
    await useComponentsStore.getState().probeProject(() => Promise.reject(new Error('нет сети')));
    expect(useComponentsStore.getState().projectOpen).toBe(false);
  });
});
