/**
 * Понятные ошибки загрузки карты: настоящий fetchJsonFile на ответах, какие отдаёт сервер.
 */
import { describe, expect, test } from 'bun:test';
import { fetchJsonFile } from './load-error';

/** fetch, который отвечает заданным ответом или падает. */
function answer(res: Response | Error): typeof fetch {
  return Object.assign(async () => {
    if (res instanceof Error) {
      throw res;
    }
    return res;
  }, { preconnect: () => undefined });
}

describe('загрузка JSON карты', () => {
  test('JSON — значение', async () => {
    expect(await fetchJsonFile('Карта', '/maps/a.json', answer(new Response('{"a":1}')))).toEqual({ ok: true, json: { a: 1 } });
  });

  test('вместо файла — веб-страница: по-русски, без «Unexpected token»', async () => {
    const r = await fetchJsonFile('Карта', '/maps/nope.json', answer(new Response('<!doctype html><html></html>', { headers: { 'content-type': 'text/html' } })));
    expect(r).toEqual({ ok: false, error: 'Карта: по адресу /maps/nope.json нет файла — сервер вернул веб-страницу. Выберите карту в списке сверху или проверьте путь.' });
  });

  test('404 и другие коды', async () => {
    expect(await fetchJsonFile('Карта', '/maps/x.json', answer(new Response('', { status: 404 })))).toEqual({ ok: false, error: 'Карта: файл /maps/x.json не найден (HTTP 404). Выберите карту в списке сверху или проверьте путь.' });
    expect(await fetchJsonFile('Каталог карт', '/maps/index.json', answer(new Response('', { status: 502 })))).toEqual({ ok: false, error: 'Каталог карт: сервер не отдал /maps/index.json (HTTP 502). Обновите страницу; если повторяется — перезапустите визуализатор.' });
  });

  test('битый JSON и нет сети', async () => {
    const bad = await fetchJsonFile('Карта', '/maps/b.json', answer(new Response('{oops')));
    expect(bad.ok ? '' : bad.error).toStartWith('Карта: файл /maps/b.json повреждён — это не JSON (');
    expect(await fetchJsonFile('Карта', '/maps/c.json', answer(new Error('Failed to fetch')))).toEqual({ ok: false, error: 'Карта: нет связи с визуализатором, /maps/c.json не загрузился (Failed to fetch). Проверьте, что dev-сервер запущен.' });
  });
});