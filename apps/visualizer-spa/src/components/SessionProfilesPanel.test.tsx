/**
 * Профили входа шлюза как у пользователя: список, выход, форма dev-входа и вставки кук.
 * Шлюз — подмена fetch для /__lam_sessions (настоящий dev-сервер в unit не поднят).
 */
import { useDom } from '../test/dom';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { act, fireEvent, render, waitFor, within } from '@testing-library/react';
import type { ProfileSummary } from '../lib/gateway/session-store';
import { useGatewayStore } from '../store/gateway-store';
import { jsonResponse, openMap, resetStores, stubFetch } from '../test/fixtures';
import { SessionProfilesPanel } from './SessionProfilesPanel';

useDom();

const RECRUITER: ProfileSummary = {
  id: 'recruiter',
  label: 'Рекрутер',
  role: 'recruiter',
  origins: [
    { origin: 'https://vite.localhost:5175', cookies: ['sid'], storageKeys: ['tg'] },
    { origin: 'http://localhost:16002', cookies: [], storageKeys: [] },
  ],
  updatedAt: '2026-11-22T00:00:00Z',
};
const ADMIN: ProfileSummary = { id: 'admin', label: 'Админ', origins: [], updatedAt: '2026-11-22T00:00:00Z' };

let profiles: unknown[] = [];
let net: ReturnType<typeof stubFetch>;

beforeEach(() => {
  resetStores();
  profiles = [RECRUITER, { id: 1 }, ADMIN];
  net = stubFetch((url, init) => {
    const method = init?.method ?? 'GET';
    if (url === '/__lam_sessions' && method === 'GET') {
      return jsonResponse({ gatewayPort: 4320, profiles });
    }
    if (url === '/__lam_sessions/admin' && method === 'DELETE') {
      profiles = [RECRUITER];
      return jsonResponse({ ok: true });
    }
    if (url === '/__lam_sessions/employer/korbor-dogfood') {
      return jsonResponse({ ok: true });
    }
    if (url === '/__lam_sessions/employer' && method === 'PUT') {
      return jsonResponse({ error: 'origin не из карты' }, 400);
    }
    return undefined;
  });
});

afterEach(() => net.restore());

const ACTORS = [{ id: 'u1', kind: 'user' as const, label: 'Анна', role: 'employer' }];

/** Отправить форму, как кнопкой «Войти», и дождаться действия. */
async function submitForm(button: HTMLElement): Promise<void> {
  const form = button.closest('form');
  if (form === null) {
    throw new Error('кнопка вне формы');
  }
  await act(async () => {
    fireEvent.submit(form);
    await new Promise((r) => setTimeout(r, 0));
  });
}

/** Заполнить поля формы по подписям (пусто — оставить пустым). */
function fill(ui: ReturnType<typeof within>, values: Partial<Record<string, string>>): void {
  for (const [label, value] of Object.entries(values)) {
    fireEvent.change(ui.getByLabelText(label), { target: { value } });
  }
}

function panel(actors = ACTORS, actorsError: string | null = null) {
  const r = render(<SessionProfilesPanel actors={actors} actorsError={actorsError} apiBase="http://127.0.0.1:16000" />);
  return within(r.container);
}

describe('профили входа', () => {
  test('шлюз не отвечает: сообщение с причиной', async () => {
    useGatewayStore.setState({ port: null, error: 'connect ECONNREFUSED' });
    const ui = panel();
    expect(ui.getByRole('status').textContent).toBe('Шлюз живых экранов не отвечает: connect ECONNREFUSED. Он запускается вместе с dev-сервером визуализатора.');
    act(() => useGatewayStore.setState({ error: null }));
    expect(ui.getByRole('status').textContent).toBe('Шлюз живых экранов не отвечает. Он запускается вместе с dev-сервером визуализатора.');
  });

  test('список профилей из шлюза: что сохранено, выход', async () => {
    await act(() => useGatewayStore.getState().refresh());
    expect(useGatewayStore.getState().profiles.map((p) => p.id)).toEqual(['recruiter', 'admin']);
    const ui = panel();
    const items = ui.getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual([
      'Рекрутер recruiterhttps://vite.localhost:5175 · кука sid, tghttp://localhost:16002 · пустоВыйти',
      'Админ adminВыйти',
    ]);
    const admin = items[1];
    if (admin === undefined) {
      throw new Error('нет профиля admin');
    }
    fireEvent.click(within(admin).getByRole('button', { name: 'Выйти' }));
    await waitFor(() => expect(ui.getAllByRole('listitem')).toHaveLength(1));
  });

  test('пустой список и пустой список пользователей korbor', async () => {
    profiles = [];
    await act(() => useGatewayStore.getState().refresh());
    const ui = panel([], 'API korbor не отвечает');
    expect(ui.getByText('Профилей нет: экраны открываются без входа.')).toBeTruthy();
    expect(ui.getByText('Список пуст: API korbor не отвечает')).toBeTruthy();
  });

  test('приложения — origin экранов карты, по алфавиту, без повторов', async () => {
    const doc = openMap('korbor-miniapp');
    await act(() => useGatewayStore.getState().refresh());
    const ui = panel([], null);
    const options = within(ui.getByLabelText('Приложение')).getAllByRole('option').map((o) => o.getAttribute('value'));
    const expected = [...new Set(doc.nodes.flatMap((n) => (n.url !== undefined && /^https?:/.test(n.url) ? [new URL(n.url).origin] : [])))].sort();
    expect(options).toEqual(['', ...expected]);
    expect(ui.getByText('Список пуст: нужен API korbor с DOGFOOD_DEV')).toBeTruthy();
  });

  test('dev-вход: пустые поля подсвечиваются по одному, затем профиль сохранён', async () => {
    openMap('korbor-miniapp');
    await act(() => useGatewayStore.getState().refresh());
    const ui = panel();
    const origin = within(ui.getByLabelText('Приложение')).getAllByRole('option')[1]?.getAttribute('value') ?? '';
    // React 19 после действия сбрасывает поля формы — каждый раз заполняем заново, как пользователь.
    const attempt = async (f: Partial<Record<string, string>>): Promise<string | null> => {
      fill(ui, f);
      await submitForm(ui.getByRole('button', { name: 'Войти' }));
      return ui.queryByRole('alert')?.textContent ?? null;
    };
    const full = { 'Профиль (id)': 'employer', 'Подпись': 'Клиент', 'Приложение': origin, 'Пользователь': 'user:u1', 'API korbor': 'http://127.0.0.1:16000' };
    expect(await attempt({})).toBe('Впишите id: строчные латинские буквы, цифры, дефис — например recruiter');
    expect(await attempt({ 'Профиль (id)': 'employer' })).toBe('Впишите подпись профиля, например «Рекрутер»');
    expect(await attempt({ 'Профиль (id)': 'employer', 'Подпись': 'Клиент' })).toBe('Выберите приложение — адрес вида http://localhost:16002');
    expect(await attempt({ ...full, 'Пользователь': '' })).toBe('Выберите пользователя из базы korbor');
    expect(await attempt({ ...full, 'API korbor': 'не адрес' })).toBe('Впишите адрес API korbor, например http://127.0.0.1:16000');
    expect(await attempt(full)).toBeNull();
    await waitFor(() => expect(ui.getByRole('status').textContent).toBe('Профиль «Клиент» сохранён — экраны откроются под ним'));
    const sent = net.calls.find((c) => c.url === '/__lam_sessions/employer/korbor-dogfood');
    expect(JSON.parse(sent?.body ?? '{}')).toEqual({ label: 'Клиент', role: '', origin, kind: 'user', actorId: 'u1', apiBase: 'http://127.0.0.1:16000' });
  });

  test('вставка кук: проверки полей, ошибка шлюза — общая подсказка формы', async () => {
    openMap('korbor-miniapp');
    await act(() => useGatewayStore.getState().refresh());
    const ui = panel();
    fireEvent.change(ui.getByLabelText('Как войти'), { target: { value: 'paste' } });
    expect(ui.queryByLabelText('Пользователь')).toBeNull();
    const origin = within(ui.getByLabelText('Приложение')).getAllByRole('option')[1]?.getAttribute('value') ?? '';
    const base = { 'Профиль (id)': 'employer', 'Подпись': 'Клиент', 'Приложение': origin };
    const attempt = async (f: Partial<Record<string, string>>): Promise<string | null> => {
      fill(ui, { ...base, ...f });
      await submitForm(ui.getByRole('button', { name: 'Войти' }));
      return ui.queryByRole('alert')?.textContent ?? null;
    };
    expect(await attempt({})).toBe('Вставьте куки («sid=…; csrf=…») или токен с ключом sessionStorage');
    expect(await attempt({ 'Ключ sessionStorage': 'tg' })).toBe('Впишите значение для «tg» (токен, initData)');
    expect(await attempt({ 'Значение (токен)': 'abc' })).toBe('Впишите ключ sessionStorage, куда приложение кладёт токен');
    await attempt({ 'Ключ sessionStorage': 'tg', 'Значение (токен)': 'abc', 'Куки': 'sid=1' });
    await waitFor(() => expect(ui.getByRole('alert').textContent).toBe('origin не из карты'));
    const sent = net.calls.find((c) => c.method === 'PUT');
    expect(JSON.parse(sent?.body ?? '{}')).toEqual({ label: 'Клиент', role: '', origin, cookies: 'sid=1', storage: { tg: 'abc' } });
    fireEvent.change(ui.getByLabelText('Как войти'), { target: { value: 'korbor-dogfood' } });
    expect(ui.getByLabelText('Пользователь')).toBeTruthy();
  });

  test('шлюз недоступен при отправке: действие падает с ошибкой сети', async () => {
    await act(() => useGatewayStore.getState().refresh());
    openMap('korbor-miniapp');
    const ui = panel();
    const origin = within(ui.getByLabelText('Приложение')).getAllByRole('option')[1]?.getAttribute('value') ?? '';
    net.restore();
    net = stubFetch(() => { throw new Error('offline'); });
    fill(ui, { 'Профиль (id)': 'employer', 'Подпись': 'Клиент', 'Приложение': origin, 'Пользователь': 'user:u1', 'API korbor': 'http://127.0.0.1:16000' });
    const errors: unknown[] = [];
    const onError = (e: ErrorEvent): void => { errors.push(e.error); e.preventDefault(); };
    window.addEventListener('error', onError);
    await submitForm(ui.getByRole('button', { name: 'Войти' })).catch((e: unknown) => errors.push(e));
    window.removeEventListener('error', onError);
    expect(net.calls.some((c) => c.url === '/__lam_sessions/employer/korbor-dogfood')).toBe(true);
    expect(errors.map((e) => (e instanceof Error ? e.message : String(e))).join()).toContain('offline');
  });
});

describe('store шлюза', () => {
  test('шлюз отвечает не тем: порт сброшен, причина с HTTP-кодом', async () => {
    net.restore();
    net = stubFetch((url) => (url === '/__lam_sessions' ? jsonResponse({ gatewayPort: 'x', profiles: [] }) : undefined));
    await useGatewayStore.getState().refresh();
    expect(useGatewayStore.getState()).toMatchObject({ port: null, error: 'шлюз не отвечает (HTTP 200)' });
    net.restore();
    net = stubFetch(() => jsonResponse(null));
    await useGatewayStore.getState().refresh();
    expect(useGatewayStore.getState().error).toBe('шлюз не отвечает (HTTP 200)');
    net.restore();
    net = stubFetch(() => new Response('', { status: 502 }));
    await useGatewayStore.getState().refresh();
    expect(useGatewayStore.getState().error).toBe('шлюз не отвечает (HTTP 502)');
    net.restore();
    net = stubFetch(() => { throw new Error('offline'); });
    await useGatewayStore.getState().refresh();
    expect(useGatewayStore.getState().port).toBeNull();
    expect(useGatewayStore.getState().error).toContain('offline');
  });

  test('первые id списков под профилем: значения, не строки — null', async () => {
    net.restore();
    net = stubFetch((url) => (url === '/__lam_sessions/recruiter/sample-ids' ? jsonResponse({ values: { vacancies: 'v-1', users: 7 } }) : undefined));
    await useGatewayStore.getState().loadSamples('recruiter', 'https://vite.localhost:5175', ['vacancies', 'users']);
    const got = useGatewayStore.getState().samples.get('recruiter');
    expect(got?.get('vacancies')).toBe('v-1');
    expect(got?.get('users')).toBeNull();
    expect(JSON.parse(net.calls[0]?.body ?? '{}')).toEqual({ origin: 'https://vite.localhost:5175', lists: ['vacancies', 'users'] });
    await useGatewayStore.getState().loadSamples('recruiter', 'https://vite.localhost:5175', ['vacancies']);
    expect(net.calls).toHaveLength(1);
  });

  test('ответ без values: списки пустые', async () => {
    net.restore();
    net = stubFetch(() => jsonResponse({ nothing: true }));
    await useGatewayStore.getState().loadSamples('employer', 'https://vite.localhost:5175', ['jobs']);
    expect(useGatewayStore.getState().samples.get('employer')?.get('jobs')).toBeNull();
    net.restore();
    net = stubFetch(() => jsonResponse({ values: 'x' }));
    await useGatewayStore.getState().loadSamples('other', 'https://vite.localhost:5175', ['jobs']);
    expect(useGatewayStore.getState().samples.get('other')?.get('jobs')).toBeNull();
  });
});
