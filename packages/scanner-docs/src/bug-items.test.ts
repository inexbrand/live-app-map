/**
 * Пункты 09-bugs: разбор (открыт / закрыт / вне разделов) и переключение с записью
 * в текст — на настоящих файлах 09-bugs эпох этого репозитория.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { bugItems, setBugItemState } from './bug-items';
import { openBugItems } from './markdown-text';

/** Копия 09-bugs эпохи e2e-green до закрытия её пунктов. */
const E2E_GREEN = readFileSync(path.resolve(import.meta.dir, '../fixtures/e2e-green-09-bugs.md'), 'utf8');

const SECTIONS = `# Баги

## Open

- Картинка не грузится
  подробности в 08
- (пусто)

## Closed

- Ссылка вела не туда
`;

describe('bugItems', () => {
  test('разделы Open/Closed: открытый с продолжением, заглушка пропущена, закрытый', () => {
    expect(bugItems(SECTIONS).map((b) => [b.state, b.text, b.line])).toEqual([
      ['open', 'Картинка не грузится', 4],
      ['closed', 'Ссылка вела не туда', 10],
    ]);
  });

  test('чекбоксы и пункты вне разделов (e2e-green): [x] закрыт, остальное — вне разделов', () => {
    const items = bugItems(E2E_GREEN);
    expect(items.filter((b) => b.state === 'closed').length).toBe(4);
    expect(items.filter((b) => b.state === 'other').map((b) => b.text)).toEqual([
      'После импорта файла селект карт показывает «Выберите карту…», хотя карта загружена.',
      'Клиент (`gateway-store.loadSamples`) запоминает неудачный запрос списков и не повторяет его до перезагрузки страницы.',
    ]);
  });

  test('openBugItems — открытые пункты из bugItems', () => {
    expect(openBugItems(SECTIONS)).toEqual(['Картинка не грузится']);
  });
});

describe('setBugItemState', () => {
  test('закрыть пункт раздела Open: блок с продолжением переезжает в Closed, заглушка Open остаётся', () => {
    const r = setBugItemState(SECTIONS, 4, 'Картинка не грузится', 'closed');
    expect(r).toEqual({
      ok: true,
      changed: true,
      text: `# Баги

## Open

- (пусто)

## Closed

- Ссылка вела не туда
- Картинка не грузится
  подробности в 08
`,
    });
    if (r.ok) {
      expect(openBugItems(r.text)).toEqual([]);
    }
  });

  test('открыть закрытый: переезжает в Open, заглушка «(пусто)» убирается; повтор — без изменений', () => {
    const r = setBugItemState(SECTIONS, 10, 'Ссылка вела не туда', 'open');
    expect(r.ok && openBugItems(r.text)).toEqual(['Картинка не грузится', 'Ссылка вела не туда']);
    expect(r.ok && r.text.includes('(пусто)')).toBe(false);
    const line = r.ok ? bugItems(r.text).find((b) => b.text === 'Ссылка вела не туда')?.line : undefined;
    const again = r.ok && line !== undefined ? setBugItemState(r.text, line, 'Ссылка вела не туда', 'open') : null;
    expect(again).toEqual({ ok: true, changed: false, text: r.ok ? r.text : '' });
  });

  test('чекбокс меняется на месте; пункт вне разделов закрывается в новый раздел Closed', () => {
    const text = '# B\n\n- [ ] первый\n\nЗамечено:\n\n- второй\n';
    const r1 = setBugItemState(text, 2, 'первый', 'closed');
    expect(r1.ok && r1.text).toBe('# B\n\n- [x] первый\n\nЗамечено:\n\n- второй\n');
    const r2 = setBugItemState(text, 6, 'второй', 'closed');
    expect(r2.ok && r2.text).toBe('# B\n\n- [ ] первый\n\nЗамечено:\n\n## Closed\n\n- второй\n');
  });

  test('строка не совпала с ожидаемым пунктом — ошибка, текст не трогается', () => {
    const r = setBugItemState(SECTIONS, 4, 'Другой пункт', 'closed');
    expect(r.ok).toBe(false);
  });
});
