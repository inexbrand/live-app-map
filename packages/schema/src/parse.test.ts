import { describe, expect, test } from 'bun:test';
import { parseLiveAppMapJson, parseAppMapDocument } from './parse';
import { liveAppMapToAppMap, appMapToLiveAppMap } from './convert';

const sampleLive = {
  version: '1.0',
  baseUrl: 'http://localhost:5173',
  pages: [
    { id: 'home', title: 'Home', path: '/' },
    {
      id: 'feed',
      title: 'Feed',
      path: '/feed',
      states: [
        {
          name: 'recruiter',
          note: 'Роль рекрутера',
          inject: { role: 'recruiter', query: { lam_role: 'recruiter' } },
        },
        {
          name: 'employer',
          note: 'Роль клиента (employer)',
          inject: { role: 'employer', query: { lam_role: 'employer' } },
        },
      ],
    },
  ],
  edges: [{ from: 'home', to: 'feed', label: 'Open feed', kind: 'navigation' }],
};

describe('parseLiveAppMapJson', () => {
  test('принимает валидный документ со states', () => {
    const result = parseLiveAppMapJson(JSON.stringify(sampleLive));
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.document.pages).toHaveLength(2);
    const feed = result.document.pages.find((p) => p.id === 'feed');
    expect(feed?.states?.[0]?.inject?.role).toBe('recruiter');
  });

  test('отклоняет битый JSON', () => {
    const result = parseLiveAppMapJson('{');
    expect(result.ok).toBe(false);
  });
});

describe('roundtrip convert', () => {
  test('live → appmap → live сохраняет pages и states', () => {
    const parsed = parseLiveAppMapJson(JSON.stringify(sampleLive));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    const enterprise = liveAppMapToAppMap(parsed.document);
    const back = appMapToLiveAppMap(enterprise);
    expect(back.pages.map((p) => p.id).sort()).toEqual(['feed', 'home']);
    const feed = back.pages.find((p) => p.id === 'feed');
    expect(feed?.states?.some((s) => s.inject?.role === 'employer')).toBe(true);

    const reparse = parseAppMapDocument(enterprise);
    expect(reparse.ok).toBe(true);
  });
});
