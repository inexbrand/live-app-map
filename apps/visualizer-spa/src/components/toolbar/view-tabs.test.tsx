/**
 * Вкладки видов шапки и кнопка шапки.
 */
import { describe, expect, test } from 'bun:test';
import { Layers } from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ToolbarButton } from './ToolbarButton';
import { VIEW_TABS, visibleViewTabs } from './view-tabs';

describe('visibleViewTabs', () => {
  test('экраны и сравнение всегда; API, БД, документация — если есть в карте', () => {
    const none = visibleViewTabs({ hasApi: false, hasDb: false, hasDocs: false }).map((t) => t.view);
    expect(none).toEqual(['screens', 'compare']);
    const all = visibleViewTabs({ hasApi: true, hasDb: true, hasDocs: true }).map((t) => t.view);
    expect(all).toEqual(VIEW_TABS.map((t) => t.view));
    expect(visibleViewTabs({ hasApi: false, hasDb: true, hasDocs: false }).map((t) => t.view)).toEqual(['screens', 'database', 'compare']);
  });

  test('у вкладок, которые ищут e2e, есть data-testid', () => {
    const ids = new Map(VIEW_TABS.map((t) => [t.view, t.testId]));
    expect([ids.get('api'), ids.get('docs'), ids.get('compare')]).toEqual(['view-api', 'view-docs', 'view-compare']);
  });
});

describe('ToolbarButton', () => {
  test('выбранная — заливка основным цветом, иначе контур; подпись сворачиваемая или всегда видна; дети после подписи', () => {
    const on = renderToStaticMarkup(<ToolbarButton icon={Layers} label="Вид" selected />);
    expect(on).toContain('bg-primary');
    expect(on).toContain('<span class="max-[900px]:hidden">Вид</span>');
    const plain = renderToStaticMarkup(
      <ToolbarButton icon={Layers} label="Источники" labelCollapses={false}>
        <kbd>K</kbd>
      </ToolbarButton>,
    );
    expect(plain).toContain('border-border');
    expect(plain).not.toContain('bg-primary');
    expect(plain).not.toContain('max-[900px]:hidden');
    expect(plain.indexOf('Источники')).toBeLessThan(plain.indexOf('<kbd>K</kbd>'));
    expect(renderToStaticMarkup(<ToolbarButton icon={Layers} size="icon-sm" aria-label="x" />)).toContain('size-7');
  });
});
