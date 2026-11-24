/**
 * Раскладка без наложений: реальная карта korbor-all и крайние случаи.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { liveAppMapToAppMap, parseLiveAppMapJson } from '@live-app-map/schema';
import { findOverlaps, NODE_GAP, packLayout, startViewport, type LayoutBox } from './pack-layout';

const allMap = path.resolve(import.meta.dir, '../../public/maps/korbor-all.liveappmap.json');

function korborBoxes(): { boxes: LayoutBox[]; links: Array<{ from: string; to: string }> } {
  const parsed = parseLiveAppMapJson(readFileSync(allMap, 'utf8'));
  if (!parsed.ok) {
    throw new Error('карта korbor-all не разобралась');
  }
  const doc = liveAppMapToAppMap(parsed.document);
  // Размеры разные, как у телефона, десктопа и сервиса — наложения проверяются на них.
  const boxes = doc.nodes.map((n, i) => ({
    id: n.id,
    width: n.kind === 'service' ? 300 : i % 2 === 0 ? 312 : 980,
    height: n.kind === 'service' ? 132 : i % 3 === 0 ? 700 : 560,
    group: n.kind === 'service' ? 'services' : n.groupIds?.[0] ?? 'other',
  }));
  const links = doc.edges.flatMap((e) => (e.to === null ? [] : [{ from: e.from, to: e.to }]));
  return { boxes, links };
}

const opts = { groupOrder: ['miniapp', 'admin', 'site', 'services'], groupTitles: new Map([['miniapp', 'Мини-приложение']]), maxRowWidth: 4200 };

describe('packLayout', () => {
  test('korbor-all: ни одна пара нод не пересекается, каждая нода внутри своей рамки, рамки не пересекаются', () => {
    const { boxes, links } = korborBoxes();
    expect(boxes.length).toBeGreaterThan(50);
    const layout = packLayout(boxes, links, opts);
    const rects = boxes.map((b) => {
      const p = layout.positions.get(b.id);
      if (p === undefined) {
        throw new Error(`нет позиции у ${b.id}`);
      }
      return { id: b.id, x: p.x, y: p.y, width: b.width, height: b.height };
    });
    expect(findOverlaps(rects)).toEqual([]);
    expect(findOverlaps(layout.groups)).toEqual([]);
    for (const r of rects) {
      const group = layout.groups.find((g) => g.id === boxes.find((b) => b.id === r.id)?.group);
      expect(group).toBeDefined();
      if (group !== undefined) {
        expect(r.x >= group.x && r.y >= group.y && r.x + r.width <= group.x + group.width && r.y + r.height <= group.y + group.height).toBe(true);
      }
    }
    expect(layout.groups.map((g) => g.id)).toEqual(['miniapp', 'admin', 'site', 'services']);
    expect(layout.groups[0]?.title).toBe('Мини-приложение');
  });

  test('korbor-all: крупная группа не столбец — высота рамки не больше ширины вдвое', () => {
    const { boxes, links } = korborBoxes();
    const layout = packLayout(boxes, links, opts);
    const tall = layout.groups.filter((g) => g.height > g.width * 2).map((g) => `${g.id} ${Math.round(g.width)}×${Math.round(g.height)}`);
    expect(tall).toEqual([]);
  });

  test('findOverlaps ловит пересечение и не считает касание', () => {
    const a = { id: 'a', x: 0, y: 0, width: 10, height: 10 };
    expect(findOverlaps([a, { id: 'b', x: 5, y: 5, width: 10, height: 10 }])).toEqual([['a', 'b']]);
    expect(findOverlaps([a, { id: 'c', x: 10, y: 0, width: 10, height: 10 }])).toEqual([]);
  });

  test('стартовый вид: масштаб не мельче порога читаемости, угол первой группы в кадре', () => {
    const { boxes, links } = korborBoxes();
    const layout = packLayout(boxes, links, opts);
    const vp = startViewport(layout, boxes, { width: 1600, height: 1000 }, { min: 0.75, max: 1 });
    expect(vp.zoom).toBeGreaterThanOrEqual(0.75);
    expect(vp.zoom).toBeLessThanOrEqual(1);
    const g = layout.groups[0];
    expect(g).toBeDefined();
    if (g !== undefined) {
      expect(g.x * vp.zoom + vp.x).toBeGreaterThanOrEqual(0);
      expect(g.y * vp.zoom + vp.y).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('packLayout: состояния рядом с экраном', () => {
  test('узлы с anchor — в том же ряду справа от экрана, по порядку, без наложений', () => {
    const boxes: LayoutBox[] = [
      { id: 'a', width: 300, height: 600, group: 'g' },
      { id: 'a@1', width: 300, height: 600, group: 'g', anchor: 'a' },
      { id: 'a@2', width: 300, height: 400, group: 'g', anchor: 'a' },
      { id: 'b', width: 300, height: 600, group: 'g' },
    ];
    const layout = packLayout(boxes, [{ from: 'a', to: 'b' }], { ...opts, groupOrder: ['g'] });
    const pa = layout.positions.get('a');
    const p1 = layout.positions.get('a@1');
    const p2 = layout.positions.get('a@2');
    expect(pa !== undefined && p1 !== undefined && p2 !== undefined).toBe(true);
    expect(p1?.y).toBe(pa?.y);
    expect(p2?.y).toBe(pa?.y);
    expect(p1?.x).toBe((pa?.x ?? 0) + 300 + NODE_GAP);
    expect(p2?.x).toBe((p1?.x ?? 0) + 300 + NODE_GAP);
    const rects = boxes.map((b) => ({ id: b.id, x: layout.positions.get(b.id)?.x ?? 0, y: layout.positions.get(b.id)?.y ?? 0, width: b.width, height: b.height }));
    expect(findOverlaps(rects)).toEqual([]);
  });

  test('anchor на экран вне набора — узел ставится сам по себе', () => {
    const layout = packLayout([{ id: 'x@1', width: 300, height: 300, group: 'g', anchor: 'нет' }], [], { ...opts, groupOrder: ['g'] });
    expect(layout.positions.has('x@1')).toBe(true);
  });

  test('korbor-all + по 3 состояния у каждого третьего экрана: без наложений, высота растёт не больше чем вдвое', () => {
    const { boxes, links } = korborBoxes();
    const before = packLayout(boxes, links, opts);
    const withStates: LayoutBox[] = boxes.flatMap((b, i) =>
      b.group === 'services' || i % 3 !== 0 ? [b] : [b, ...[1, 2, 3].map((k) => ({ id: `${b.id}@state:${k}`, width: b.width, height: b.height, group: b.group, anchor: b.id }))],
    );
    const after = packLayout(withStates, links, opts);
    const rects = withStates.map((b) => ({ id: b.id, x: after.positions.get(b.id)?.x ?? NaN, y: after.positions.get(b.id)?.y ?? NaN, width: b.width, height: b.height }));
    expect(rects.every((r) => Number.isFinite(r.x))).toBe(true);
    expect(findOverlaps(rects)).toEqual([]);
    const height = (l: typeof before): number => Math.max(...l.groups.map((g) => g.y + g.height));
    const width = (l: typeof before): number => Math.max(...l.groups.map((g) => g.x + g.width));
    // площадь нод выросла ~в 2 раза — раскладка растёт в обе стороны, а не столбцом
    expect(height(after) / height(before)).toBeLessThan(2);
    expect(width(after) / width(before)).toBeLessThan(2.5);
    console.log(`korbor-all: ${withStates.length - boxes.length} узлов-состояний; раскладка ${Math.round(width(before))}×${Math.round(height(before))} → ${Math.round(width(after))}×${Math.round(height(after))}`);
  });
});
