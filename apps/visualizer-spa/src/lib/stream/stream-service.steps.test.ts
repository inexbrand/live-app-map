/**
 * Шаги состояния в трансляции на настоящем headless Helium: кадр готовности —
 * только после шагов (клик открыл модалку), ошибка шага — сообщением с номером шага.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { Server } from 'bun';
import { decode } from 'jpeg-js';
import { launchStreamBrowser } from './stream-browser';
import type { StreamScreen } from './stream-protocol';
import { StreamService } from './stream-service';

/** Белая страница, кнопка «Фильтры» открывает зелёную модалку на весь экран (через 300 мс — как анимация). */
const PAGE = `<!doctype html><html><body style="margin:0;background:#fff">
<button id="open" style="position:absolute;left:10px;top:10px;width:120px;height:40px">Фильтры</button>
<input id="q" style="position:absolute;left:10px;top:60px;width:120px;height:30px">
<script>
document.getElementById('open').addEventListener('click', function () {
  setTimeout(function () {
    var m = document.createElement('div');
    m.id = 'modal';
    m.setAttribute('role', 'dialog');
    m.style.cssText = 'position:fixed;inset:0;background:#0a0';
    m.textContent = 'Модалка ' + document.getElementById('q').value;
    document.body.appendChild(m);
  }, 300);
});
</script></body></html>`;

let app: Server<undefined>;
let service: StreamService;
const firstFrame = new Map<string, Uint8Array>();
const stepResults: { key: string; error: string | null }[] = [];

function screen(key: string, steps: StreamScreen['steps']): StreamScreen {
  return { key, url: `http://127.0.0.1:${app.port}/state-${key}`, width: 400, height: 300, live: true, ...(steps === undefined ? {} : { steps }) };
}

async function until(cond: () => boolean, ms = 20_000): Promise<void> {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) {
      throw new Error('не дождались');
    }
    await Bun.sleep(50);
  }
}

/** Цвет середины кадра — из самого JPEG (canvas Helium читается белым). */
function centerRgb(jpeg: Uint8Array): number[] {
  const img = decode(jpeg, { useTArray: true });
  const at = ((img.height >> 1) * img.width + (img.width >> 1)) * 4;
  return [img.data[at] ?? 0, img.data[at + 1] ?? 0, img.data[at + 2] ?? 0];
}

beforeAll(() => {
  app = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: () => new Response(PAGE, { headers: { 'content-type': 'text/html; charset=utf-8' } }) });
  service = new StreamService({
    launch: launchStreamBrowser,
    onFrame: (key, jpeg) => {
      if (!firstFrame.has(key)) {
        firstFrame.set(key, jpeg);
      }
    },
    onPageMessage: () => undefined,
    onSteps: (key, error) => stepResults.push({ key, error }),
  });
});

afterAll(async () => {
  // Браузер постоянный: свои вкладки закрыть, затем отключиться
  await service.sync([]);
  await service.close();
  void app.stop(true);
});

describe('StreamService: шаги состояния', () => {
  test('ввод и клик выполняются до первого кадра: первый кадр — открытая модалка', async () => {
    await service.sync([screen('ok', [{ fill: '#q', value: 'java' }, { click: 'text=Фильтры' }, { waitFor: 'role=dialog' }])]);
    await until(() => firstFrame.has('ok'));
    const rgb = centerRgb(firstFrame.get('ok') ?? new Uint8Array());
    // #0a0 — модалка; белый — страница до шагов
    expect(rgb[1] ?? 0).toBeGreaterThan(120);
    expect(rgb[0] ?? 255).toBeLessThan(60);
    await until(() => stepResults.some((r) => r.key === 'ok'));
    expect(stepResults.find((r) => r.key === 'ok')?.error).toBeNull();
  }, 40_000);

  test('шаг с несуществующим селектором: «шаг 2 не выполнен: …», кадр страницы всё равно приходит', async () => {
    await service.sync([screen('bad', [{ scroll: 10 }, { click: '#нет-такого' }])]);
    await until(() => stepResults.some((r) => r.key === 'bad') && firstFrame.has('bad'));
    const err = stepResults.find((r) => r.key === 'bad')?.error ?? '';
    expect(err.startsWith('шаг 2 не выполнен: ')).toBe(true);
    expect(err).toBe('шаг 2 не выполнен: клик #нет-такого — элемент не найден за 5 с');
  }, 40_000);
});
