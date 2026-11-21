/**
 * Граф документации на настоящих картах korbor-all и live-app-map.
 */
import { beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { buildCodeIndex, buildDocRefIndex } from '@live-app-map/graph';
import { liveAppMapToAppMap, parseLiveAppMapJson, type AppMapDocument } from '@live-app-map/schema';
import {
  buildDocGraph,
  collapseEpochs,
  docReferences,
  filterGraph,
  graphNeighbors,
  localGraph,
  searchGraph,
  type DocGraph,
} from './doc-graph';

const MAPS = path.resolve(import.meta.dir, '../../../../maps');

function load(name: string): AppMapDocument {
  const res = parseLiveAppMapJson(readFileSync(path.join(MAPS, name), 'utf8'));
  if (!res.ok) {
    throw new Error(res.errors.map((e) => e.message).join('\n'));
  }
  return liveAppMapToAppMap(res.document);
}

function graphOf(doc: AppMapDocument): DocGraph {
  return buildDocGraph(doc, buildDocRefIndex(doc, buildCodeIndex(doc)));
}

let korbor: AppMapDocument;
let full: DocGraph;

beforeAll(() => {
  korbor = load('korbor-all.liveappmap.json');
  full = graphOf(korbor);
});

describe('docReferences', () => {
  test('берёт однострочный код и ссылки, пропускает блоки кода и картинки', () => {
    const r = docReferences('см. `GET /api/x` и [план](05-plan.md)\n```\n`внутри`\n```\n![](a.png)');
    expect(r.codes).toEqual(['GET /api/x']);
    expect(r.hrefs).toEqual(['05-plan.md']);
  });
});

describe('buildDocGraph на korbor-all', () => {
  test('все эпохи, их файлы, заметки и руководства — узлы', () => {
    const docs = korbor.docs;
    if (docs === undefined) {
      throw new Error('в korbor-all нет docs');
    }
    const kinds = (k: string) => full.nodes.filter((n) => n.kind === k).length;
    expect(kinds('epoch')).toBe(docs.epochs.length);
    expect(kinds('epoch-file')).toBe(docs.epochs.reduce((s, e) => s + e.files.length, 0));
    expect(kinds('note')).toBe(docs.notes.length);
    expect(kinds('guide')).toBe(docs.guides.length);
  });

  test('эпоха содержит свои файлы; ссылка из текста ведёт к роуту, таблице и файлу кода', () => {
    const e = korbor.docs?.epochs[0];
    const contains = full.edges.filter((x) => x.kind === 'contains' && x.source === `epoch:${e?.id}`);
    expect(contains.length).toBe(e?.files.length ?? -1);
    const kinds = new Set(full.nodes.map((n) => n.kind));
    expect(kinds.has('route')).toBe(true);
    expect(kinds.has('table')).toBe(true);
    expect(kinds.has('file')).toBe(true);
    // Документ про telegram-login ссылается на роут POST /api/v1/auth/web/telegram-login.
    const route = full.nodes.find((n) => n.kind === 'route' && n.label === 'POST /api/v1/auth/web/telegram-login');
    expect(route).toBeDefined();
    expect(graphNeighbors(full, route?.id ?? '').size).toBeGreaterThan(0);
  });

  test('у роута есть сервис; петель и повторов рёбер нет', () => {
    const route = full.nodes.find((n) => n.kind === 'route');
    const nb = [...graphNeighbors(full, route?.id ?? '')];
    expect(nb.some((id) => id.startsWith('service:'))).toBe(true);
    const keys = full.edges.map((e) => [e.source, e.target].sort().join('|'));
    expect(new Set(keys).size).toBe(keys.length);
    expect(full.edges.every((e) => e.source !== e.target)).toBe(true);
  });
});

describe('свёртка, фильтры, соседи', () => {
  test('свёрнутые эпохи забирают ссылки своих файлов', () => {
    const collapsed = collapseEpochs(full, new Set());
    expect(collapsed.nodes.some((n) => n.kind === 'epoch-file')).toBe(false);
    const targetsFull = new Set(full.edges.filter((e) => e.kind === 'links').map((e) => e.target));
    const touched = collapsed.edges.filter((e) => e.source.startsWith('epoch:') && !e.target.startsWith('epoch:'));
    expect(touched.length).toBeGreaterThan(0);
    expect(touched.every((e) => targetsFull.has(e.target) || e.target.startsWith('doc:'))).toBe(true);
    const one = korbor.docs?.epochs[0]?.id ?? '';
    const expanded = collapseEpochs(full, new Set([one]));
    expect(expanded.nodes.filter((n) => n.kind === 'epoch-file').every((n) => n.epochId === one)).toBe(true);
    expect(expanded.nodes.some((n) => n.kind === 'epoch-file')).toBe(true);
  });

  test('фильтр «не готово» оставляет только незакрытые эпохи и то, на что они ссылаются', () => {
    const notReady = filterGraph(collapseEpochs(full, new Set()), { readiness: 'not-ready' });
    const epochs = notReady.nodes.filter((n) => n.kind === 'epoch');
    expect(epochs.length).toBe(korbor.docs?.epochs.filter((e) => e.readiness === 'not-ready').length ?? -1);
    expect(epochs.every((n) => n.readiness === 'not-ready')).toBe(true);
    const ids = new Set(notReady.nodes.map((n) => n.id));
    for (const n of notReady.nodes.filter((x) => x.kind === 'route' || x.kind === 'table')) {
      expect([...graphNeighbors(notReady, n.id)].some((id) => ids.has(id) && !id.startsWith('service:'))).toBe(true);
    }
  });

  test('фильтр по типу: только эпохи и таблицы', () => {
    const g = filterGraph(collapseEpochs(full, new Set()), { kinds: new Set(['epoch', 'table']) });
    expect(new Set(g.nodes.map((n) => n.kind))).toEqual(new Set(['epoch', 'table']));
  });

  test('локальный граф глубины 1 — узел и соседи; поиск находит по слову', () => {
    const route = full.nodes.find((n) => n.kind === 'route');
    const id = route?.id ?? '';
    const local = localGraph(full, id, 1);
    expect(local.nodes.length).toBe(graphNeighbors(full, id).size + 1);
    expect(localGraph(full, 'нет-такого', 1).nodes).toEqual([]);
    const hits = searchGraph(full, 'telegram-login');
    expect([...hits].some((h) => h.startsWith('route:'))).toBe(true);
    expect(searchGraph(full, '  ').size).toBe(0);
  });
});

describe('live-app-map', () => {
  test('эпохи этого репозитория связаны с файлами кода', () => {
    const g = graphOf(load('live-app-map.liveappmap.json'));
    expect(g.nodes.filter((n) => n.kind === 'epoch').length).toBeGreaterThan(3);
    expect(g.nodes.filter((n) => n.kind === 'file').length).toBeGreaterThan(5);
  });
});

describe('filterGraph: тип только показывает, связи держатся на документах', () => {
  test('«только файлы кода» — файлы, на которые ссылаются документы, без самих документов', () => {
    const g = collapseEpochs(full, new Set());
    const files = filterGraph(g, { kinds: new Set(['file']) });
    const allFiles = filterGraph(g, {}).nodes.filter((n) => n.kind === 'file').length;
    expect(files.nodes.length).toBe(allFiles);
    expect(files.nodes.length).toBeGreaterThan(0);
    expect(files.nodes.every((n) => n.kind === 'file')).toBe(true);
  });

  test('«только роуты» при «не готово» — роуты незакрытых эпох, меньше всех роутов', () => {
    const routes = filterGraph(full, { kinds: new Set(['route']) }).nodes.length;
    const notReady = filterGraph(full, { kinds: new Set(['route']), readiness: 'not-ready' }).nodes;
    expect(notReady.every((n) => n.kind === 'route')).toBe(true);
    expect(notReady.length).toBeLessThan(routes);
  });
});

describe('скорость на korbor-all', () => {
  test('сборка, свёртка и фильтр графа — меньше 300 мс', () => {
    const t0 = performance.now();
    const g = graphOf(korbor);
    const c = collapseEpochs(g, new Set());
    filterGraph(c, { readiness: 'not-ready' });
    const ms = performance.now() - t0;
    expect(g.nodes.length).toBeGreaterThan(500);
    expect(ms).toBeLessThan(300);
  });
});
