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

const server = Bun.serve({
  port: 0,
  fetch(req) {
    const p = new URL(req.url).pathname;
    if (p === '/ok') return Response.json({ screens: {}, components, apps });
    if (p === '/no-apps') return Response.json({ screens: {}, components });
    return new Response('проект не открыт: запустите bun run dev -- --project <каталог>', { status: 404 });
  },
});
afterAll(() => server.stop(true));

const realFetchJson = (path: string) => async (): Promise<unknown> => {
  const res = await fetch('http://127.0.0.1:' + server.port + path);
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
    expect(useComponentsStore.getState().error).toBe('в ответе /__lam_project/states нет apps — приложения из config.ts проекта');
    useComponentsStore.setState({ status: 'idle' });
    await useComponentsStore.getState().load(realFetchJson('/nope'));
    expect(useComponentsStore.getState().error).toBe('проект не открыт: запустите bun run dev -- --project <каталог>');
  });
});

