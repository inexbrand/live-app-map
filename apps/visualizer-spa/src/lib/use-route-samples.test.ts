import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { liveAppMapToAppMap, parseLiveAppMapJson } from '@live-app-map/schema';
import { sampleRequests } from './use-route-samples';
import { mapText } from '../test/fixtures';

const parsed = parseLiveAppMapJson(mapText('korbor-all'));
if (!parsed.ok) {
  throw new Error('карта korbor-all не читается');
}
const doc = liveAppMapToAppMap(parsed.document);
const profile = (id: string, origin: string, role: string) => ({ id, label: id, role, origins: [{ origin, cookies: [], storageKeys: [] }], updatedAt: '' });

test('korbor-all: списки группируются по профилю приложения, экраны без входа пропускаются', () => {
  const reqs = sampleRequests(doc, {
    baseUrl: doc.baseUrl,
    profiles: [profile('recruiter', 'https://vite.localhost:5175', 'recruiter'), profile('admin', 'http://localhost:16002', 'admin')],
    activeStates: new Map(),
    globalRole: '',
  });
  const by = new Map(reqs.map((r) => [r.profile, r]));
  expect(by.get('recruiter')?.origin).toBe('https://vite.localhost:5175');
  expect(by.get('recruiter')?.lists).toContain('/api/v1/recruiter/vacancies');
  expect(by.get('admin')?.origin).toBe('http://localhost:16002');
  expect(by.get('admin')?.lists).toContain('/api/v1/admin/vacancies');
  expect(reqs.some((r) => r.profile === 'anon')).toBe(false);
});
