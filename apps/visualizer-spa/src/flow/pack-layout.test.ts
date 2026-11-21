/**
 * Раскладка без наложений: реальная карта korbor-all и крайние случаи.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { liveAppMapToAppMap, parseLiveAppMapJson } from '@live-app-map/schema';
import { findOverlaps, packLayout, startViewport, type LayoutBox } from './pack-layout';

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
