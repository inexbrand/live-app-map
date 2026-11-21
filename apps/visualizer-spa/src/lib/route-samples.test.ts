import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseLiveAppMapJson, liveAppMapToAppMap } from '@live-app-map/schema';
import { firstId, isListPath, nodeSampleLists, paramSources, sampledPath } from './route-samples';

/** Настоящая карта мини-аппа korbor из public/maps. */
const parsed = parseLiveAppMapJson(readFileSync(path.join(import.meta.dir, '../../public/maps/korbor-miniapp.liveappmap.json'), 'utf8'));
if (!parsed.ok) {
  throw new Error('карта korbor-miniapp не читается');
}
const doc = liveAppMapToAppMap(parsed.document);
const node = (id: string) => {
  const n = doc.nodes.find((x) => x.id === id);
  if (n === undefined) {
    throw new Error(`нет ${id}`);
  }
  return n;
};

describe('списки API экрана из карты korbor', () => {
  test('vacancies/[id] — список вакансий рекрутера (экран рекрутера не ходит в кабинет клиента)', () => {
    expect(nodeSampleLists(doc, node('route:/vacancies/[id]'))).toEqual(['/api/v1/recruiter/vacancies']);
  });

  test('applications/[id]/submit — список откликов рекрутера', () => {
    expect(nodeSampleLists(doc, node('route:/applications/[id]/submit'))).toEqual(['/api/v1/recruiter/applications']);
  });

  test('экран без параметров — списков нет', () => {
    expect(nodeSampleLists(doc, node('route:/feed'))).toEqual([]);
  });
});

describe('sampledPath', () => {
  test('реальный id из доступного профилю списка; закрытый список пропускается', () => {
    const samples = new Map([['/api/v1/employer/vacancies', null], ['/api/v1/recruiter/vacancies', '94e89d32-f578-48a2-9cc0-5a36f1cc5533']]);
    expect(sampledPath(doc, node('route:/vacancies/[id]'), samples)).toBe('/vacancies/94e89d32-f578-48a2-9cc0-5a36f1cc5533');
  });

  test('нет значения — null (остаётся пример из скана)', () => {
    expect(sampledPath(doc, node('route:/vacancies/[id]'), new Map())).toBeNull();
    expect(sampledPath(doc, node('route:/vacancies/[id]'), undefined)).toBeNull();
  });
});

test('paramSources: два параметра подряд и catch-all не подставляются', () => {
  expect(paramSources('/a/[x]/[y]', ['/a/:x'])).toEqual([{ param: 'x', lists: ['/a'] }]);
  expect(paramSources('/docs/[...rest]', ['/docs/:id'])).toEqual([]);
});

test('isListPath отсекает схемы, параметры и «..»', () => {
  expect(isListPath('/api/v1/recruiter/vacancies')).toBe(true);
  expect(isListPath('http://evil/x')).toBe(false);
  expect(isListPath('/api/../secret')).toBe(false);
  expect(isListPath('/api/:id')).toBe(false);
});

test('firstId: ответы разной формы', () => {
  expect(firstId({ items: [{ id: 'a' }], nextCursor: null })).toBe('a');
  expect(firstId({ success: true, data: { items: [{ id: 7 }] } })).toBe('7');
  expect(firstId({ data: [{ id: 'b' }] })).toBe('b');
  expect(firstId([{ name: 'x' }, { id: 'c' }])).toBe('c');
  expect(firstId({ items: [] })).toBeNull();
});
describe('экраны без сопоставленных вызовов (админка korbor-all)', () => {
  const allParsed = parseLiveAppMapJson(readFileSync(path.join(import.meta.dir, '../../public/maps/korbor-all.liveappmap.json'), 'utf8'));
  if (!allParsed.ok) {
    throw new Error('карта korbor-all не читается');
  }
  const all = liveAppMapToAppMap(allParsed.document);
  const admin = (id: string) => {
    const n = all.nodes.find((x) => x.id === id);
    if (n === undefined) {
      throw new Error(`нет ${id}`);
    }
    return n;
  };

  test('vacancies/[vacancyId] — список вакансий админки из роутов карты', () => {
    expect(nodeSampleLists(all, admin('admin:route:/vacancies/[vacancyId]'))).toContain('/api/v1/admin/vacancies');
  });

  test('id из списка админки подставляется в путь', () => {
    const samples = new Map([['/api/v1/admin/vacancies', 'fd0bbe22']]);
    expect(sampledPath(all, admin('admin:route:/vacancies/[vacancyId]'), samples)).toBe('/vacancies/fd0bbe22');
  });

  test('вызовы экрана важнее общих роутов: мини-апп берёт свои списки', () => {
    expect(nodeSampleLists(all, admin('miniapp:route:/vacancies/[id]'))).toEqual(['/api/v1/recruiter/vacancies']);
  });
});
