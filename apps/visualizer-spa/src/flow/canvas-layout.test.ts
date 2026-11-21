/**
 * Нет наложений на холсте: все карты korbor, все масштабы превью, ноды
 * выбранного размера (с полосой выбора) — как их раскладывает холст.
 */
import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { liveAppMapToAppMap, parseLiveAppMapJson, type AppMapDocument } from '@live-app-map/schema';
import { filterCanvasGraph } from './canvas-graph';
import { canvasNodeSize, layoutCanvas } from './canvas-layout';
import { findOverlaps } from './pack-layout';

const mapsDir = path.resolve(import.meta.dir, '../../public/maps');
const maps: Array<[string, AppMapDocument]> = readdirSync(mapsDir)
  .filter((f) => f.endsWith('.liveappmap.json'))
  .map((f) => {
    const parsed = parseLiveAppMapJson(readFileSync(path.join(mapsDir, f), 'utf8'));
    if (!parsed.ok) {
      throw new Error(`карта ${f} не разобралась`);
    }
    return [f, liveAppMapToAppMap(parsed.document)];
  });
const SCALES = [0.25, 0.35, 0.5, 0.75, 1];

describe('layoutCanvas без наложений', () => {
  test('карты найдены', () => {
    expect(maps.length).toBeGreaterThan(0);
  });

  for (const [file, doc] of maps) {
    for (const scale of SCALES) {
      test(`${file} · масштаб ${scale}`, () => {
        const { filtered, navEdges } = filterCanvasGraph(doc, '');
        const sizing = { iframeScale: scale, nodeViewports: new Map(), contentHeights: new Map() };
        const { boxes, packed } = layoutCanvas(doc, filtered, navEdges, sizing);
        const rects = boxes.map((b) => {
          const p = packed.positions.get(b.id);
          if (p === undefined) {
            throw new Error(`нет позиции у ${b.id}`);
          }
          return { id: b.id, x: p.x, y: p.y, width: b.width, height: b.height };
        });
        expect(rects.length).toBe(filtered.length);
        expect(findOverlaps(rects)).toEqual([]);
        expect(findOverlaps(packed.groups)).toEqual([]);
        for (const r of rects) {
          const g = packed.groups.find((fr) => fr.id === boxes.find((b) => b.id === r.id)?.group);
          expect(g !== undefined && r.x >= g.x && r.y >= g.y && r.x + r.width <= g.x + g.width && r.y + r.height <= g.y + g.height).toBe(true);
        }
        // Экраны раньше сервисов: стартовый вид открывает экраны.
        const order = packed.groups.map((g) => g.id);
        if (order.includes('services')) {
          expect(order.at(-1)).toBe('services');
        }
        // Невыбранная нода не больше своей коробки: выбор одной не наезжает на соседей.
        for (const n of filtered) {
          const s = canvasNodeSize(doc, n, sizing, false);
          const box = boxes.find((b) => b.id === n.id);
          expect(box !== undefined && s.outerWidth <= box.width && s.outerHeight <= box.height).toBe(true);
        }
      });
    }
  }
});