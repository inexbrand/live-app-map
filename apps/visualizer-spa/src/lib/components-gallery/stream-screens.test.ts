import { describe, expect, test } from 'bun:test';
import { buildGallery } from './gallery';
import { COMPONENT_VIEWPORT, MAX_LIVE_COMPONENTS, componentStreamScreens, mountedComponentIds } from './stream-screens';

const apps = [{ id: 'm', label: 'М', dir: 'apps/m', baseUrl: 'http://localhost:5175' }];
const many = Object.fromEntries(Array.from({ length: 20 }, (_, i) => ['apps/m/src/C' + String(i) + '.tsx#C', [{ id: 'v', label: 'В' }]]));

describe('экраны трансляции галереи', () => {
  test('только видимые, не больше предела, в порядке галереи', () => {
    const g = buildGallery(many, apps);
    const ids = g.groups.flatMap((x) => x.items.map((i) => i.id));
    const visible = new Set(ids.slice(3));
    const mounted = mountedComponentIds(g, visible);
    expect(mounted).toEqual(ids.slice(3, 3 + MAX_LIVE_COMPONENTS));
  });

  test('экран — адрес страницы компонента и окно варианта', () => {
    const g = buildGallery({ 'apps/m/src/B.tsx#B': [{ id: 'v', label: 'В' }] }, apps);
    const id = 'component:apps/m/src/B.tsx#B/v';
    expect(componentStreamScreens(g, new Set([id]))).toEqual([
      { key: id, url: 'http://localhost:5175/@lam/component?key=apps%2Fm%2Fsrc%2FB.tsx%23B&variant=v', width: COMPONENT_VIEWPORT.width, height: COMPONENT_VIEWPORT.height, live: true },
    ]);
    expect(componentStreamScreens(g, new Set())).toEqual([]);
  });
});
