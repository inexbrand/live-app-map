import { describe, expect, test } from 'bun:test';
import { NAV_HOME, navFromSearch, searchWithNav } from './nav-location';

describe('nav-location', () => {
  test('место API с роутом переживает круг через адрес, параметры карты остаются', () => {
    const current = '?map=/maps/korbor-all.liveappmap.json&role=recruiter';
    const s = searchWithNav({ ...NAV_HOME, view: 'api', route: 'GET /api/v1/me' }, current);
    expect(s).toContain('map=%2Fmaps%2Fkorbor-all.liveappmap.json');
    expect(s).toContain('role=recruiter');
    expect(navFromSearch(s)).toEqual({ ...NAV_HOME, view: 'api', route: 'GET /api/v1/me' });
  });

  test('в адрес идёт только выбранное в открытом виде', () => {
    const s = searchWithNav({ view: 'docs', route: 'r', table: 't', doc: 'docs/epoch/x#1/00-brief.md', screen: 'n', docsMode: 'graph' }, '');
    const q = new URLSearchParams(s);
    expect(q.get('route')).toBeNull();
    expect(q.get('table')).toBeNull();
    expect(q.get('screen')).toBeNull();
    expect(q.get('doc')).toBe('docs/epoch/x#1/00-brief.md');
    expect(q.get('docs')).toBe('graph');
  });

  test('холст без выбора — пустой адрес; прежние ключи навигации стираются', () => {
    expect(searchWithNav(NAV_HOME, '?view=api&route=x')).toBe('');
    expect(searchWithNav({ ...NAV_HOME, screen: 'feed' }, '')).toBe('?screen=feed');
  });

  test('мусор в адресе даёт холст без выбора', () => {
    expect(navFromSearch('?view=nope&route=&docs=zzz')).toEqual(NAV_HOME);
  });
});
