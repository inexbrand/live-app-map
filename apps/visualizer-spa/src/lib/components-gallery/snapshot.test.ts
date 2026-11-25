import { describe, expect, test } from 'bun:test';
import { parseSnapshotQuery } from '../gateway/snapshot-middleware';
import { parseGatewayHost } from '../gateway/gateway-host';
import { buildGallery } from './gallery';
import { componentSnapshotSrc } from './snapshot';
import { COMPONENT_VIEWPORT } from './stream-screens';

const item = buildGallery(
  { 'apps/miniapp/src/ui/B.tsx#B': [{ id: 'v', label: 'В' }] },
  [{ id: 'miniapp', label: 'М', dir: 'apps/miniapp', baseUrl: 'https://vite.localhost:5175' }],
).groups[0]?.items[0];

describe('снимок варианта вне живых', () => {
  test('адрес снимка — страница компонента через шлюз без сессии; сервер снимков его принимает', () => {
    if (item === undefined) throw new Error('нет варианта');
    const src = componentSnapshotSrc(item, 4322);
    expect(src).not.toBeNull();
    const q = new URL(src ?? '', 'http://localhost:4310').searchParams;
    const parsed = parseSnapshotQuery(q, 4322);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect([parsed.width, parsed.height]).toEqual([COMPONENT_VIEWPORT.width, COMPONENT_VIEWPORT.height]);
    const u = new URL(parsed.url);
    expect(parseGatewayHost(u.host)).toEqual({ profile: 'anon', origin: 'https://vite.localhost:5175', protocol: 'https:', hostname: 'vite.localhost', port: 5175 });
    expect(u.pathname + u.search).toBe('/@lam/component?key=apps%2Fminiapp%2Fsrc%2Fui%2FB.tsx%23B&variant=v');
  });
  test('шлюза нет — снимка нет', () => {
    if (item === undefined) throw new Error('нет варианта');
    expect(componentSnapshotSrc(item, null)).toBeNull();
  });
});
