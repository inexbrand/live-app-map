/**
 * Модели видов «API» и «Документация» на настоящих картах korbor-all и live-app-map.
 */
import { beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { buildCodeIndex, type CodeIndex } from '@live-app-map/graph';
import { liveAppMapToAppMap, parseLiveAppMapJson, type AppMapDocument } from '@live-app-map/schema';
import { apiViewState, routeCard, schemaInline } from './api-view-model';
import {
  docsSections,
  epochDateLabel,
  epochFileLabel,
  galleryImages,
  openDocOf,
  readinessLabel,
  resolveDocAsset,
} from './docs-view-model';

const MAPS = path.resolve(import.meta.dir, '../../../../maps');

function load(name: string): AppMapDocument {
  const res = parseLiveAppMapJson(readFileSync(path.join(MAPS, name), 'utf8'));
  if (!res.ok) {
    throw new Error(res.errors.map((e) => e.message).join('\n'));
  }
  return liveAppMapToAppMap(res.document);
}

let korbor: AppMapDocument;
let index: CodeIndex;
let self: AppMapDocument;

beforeAll(() => {
  korbor = load('korbor-all.liveappmap.json');
  index = buildCodeIndex(korbor);
  self = load('live-app-map.liveappmap.json');
});

describe('вид «API» на korbor', () => {
  test('дерево покрывает все роуты, разделы admin/employer/recruiter есть', () => {
    const s = apiViewState(index, {});
    expect(s.routes.length).toBe(korbor.code?.routes.length ?? -1);
    const api = s.tree.find((t) => t.service.name === '@korbor/api');
    expect(api?.sections.map((x) => x.prefix)).toEqual(expect.arrayContaining(['/api/v1/admin', '/api/v1/employer', '/api/v1/recruiter']));
    expect(s.methods).toEqual(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
  });

  test('фильтр метода и таблицы сужает дерево, покрытие считается по отфильтрованным', () => {
    const s = apiViewState(index, { methods: ['PATCH'], table: 'vacancies' });
    expect(s.routes.length).toBeGreaterThan(0);
    expect(s.routes.length).toBeLessThan(apiViewState(index, { methods: ['PATCH'] }).routes.length);
    expect(s.routes.every((r) => r.method === 'PATCH' && r.dbCalls.some((c) => c.table === 'vacancies'))).toBe(true);
    expect(s.coverage.routes).toBe(s.routes.length);
  });

  test('карточка роута: вход по частям, доступ, таблицы', () => {
    const route = korbor.code?.routes.find((r) => r.path === '/api/v1/admin/disputes/:id/resolve');
    if (route === undefined) {
      throw new Error('нет роута resolve в карте korbor');
    }
    const card = routeCard(index, route.id);
    expect(card?.inputs.map((i) => i.label)).toEqual(['Параметры пути', 'Тело']);
    const body = card?.inputs.find((i) => i.part === 'body');
    expect(body?.schema.name).toBe('ResolveDisputeBodySchema');
    expect(schemaInline(body?.schema ?? { kind: 'typebox', fields: [] })).toContain('note: string');
    expect(card?.route.access?.auth).toBe(true);
    expect(routeCard(index, 'нет-такого')).toBeNull();
  });
});

describe('вид «Документация»', () => {
  test('подписи файлов эпохи словами, прочие — путём', () => {
    expect(epochFileLabel('docs/epoch/a#1', 'docs/epoch/a#1/00-brief.md')).toBe('Бриф');
    expect(epochFileLabel('docs/epoch/a#1', 'docs/epoch/a#1/09-bugs.md')).toBe('Баги');
    expect(epochFileLabel('docs/epoch/a#1', 'docs/epoch/a#1/proofs/log.md')).toBe('proofs/log');
  });

  test('дата и готовность словами', () => {
    expect(epochDateLabel('2026-11-21T20:56:36')).toBe('21 ноя 2026, 20:56');
    expect(epochDateLabel(undefined)).toBe('');
    expect(readinessLabel({ readiness: 'not-ready', openBugs: ['a', 'b'] })).toBe('не готово · 2');
    expect(readinessLabel({ readiness: 'no-bugs-file', openBugs: [] })).toBe('нет 09-bugs');
  });

  test('эпохи самого live-app-map видны, поиск находит текст', () => {
    const docs = self.docs;
    if (docs === undefined) {
      throw new Error('в карте live-app-map нет docs');
    }
    const all = docsSections(docs, '', null);
    expect(all.epochs.map((e) => e.slug)).toEqual(expect.arrayContaining(['live-korbor-e2e', 'screen-api-links']));
    const found = docsSections(docs, 'шлюз', null);
    expect(found.hits.length).toBeGreaterThan(0);
    expect(found.hits.every((h) => h.snippet.toLowerCase().includes('шлюз') || h.title.toLowerCase().includes('шлюз'))).toBe(true);
  });

  test('документ по пути файла, по каталогу эпохи и по умолчанию', () => {
    const docs = self.docs;
    const e = docs?.epochs.find((x) => x.slug === 'live-korbor-e2e');
    if (docs === undefined || e === undefined) {
      throw new Error('нет эпохи live-korbor-e2e');
    }
    expect(openDocOf(docs, e.dir)?.file.path).toBe(`${e.dir}/00-brief.md`);
    expect(openDocOf(docs, `${e.dir}/09-bugs.md`)?.epoch?.id).toBe(e.id);
    expect(openDocOf(docs, null)?.epoch?.id).toBe(docs.epochs[0]?.id);
    expect(openDocOf(docs, 'README.md')?.epoch).toBeUndefined();
  });

  test('галерея: картинки эпохи без вставленных в текст', () => {
    const imgs = ['docs/e/screens/a.png', 'docs/e/screens/b.png'];
    expect(galleryImages(imgs, 'docs/e/08-verify-report.md', 'см. ![a](screens/a.png) и screens/b.png')).toEqual(['docs/e/screens/b.png']);
  });

  test('картинка из markdown — путь от корня; внешние — null', () => {
    expect(resolveDocAsset('docs/epoch/a#1/08-verify-report.md', 'screens/x.png')).toBe('docs/epoch/a#1/screens/x.png');
    expect(resolveDocAsset('docs/epoch/a#1/proofs/r.md', '../screens/a%20b.png')).toBe('docs/epoch/a#1/screens/a b.png');
    expect(resolveDocAsset('docs/x.md', 'https://e.com/a.png')).toBeNull();
  });
});
