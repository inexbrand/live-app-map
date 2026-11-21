/**
 * Чтение списков идёт настоящим fetch к локальному серверу с ответами в
 * форме API korbor.
 */
import { afterAll, expect, test } from 'bun:test';
import { fetchSampleIds } from './sample-ids';

const seen: string[] = [];
const server = Bun.serve({
  port: 0,
  fetch(req) {
    const url = new URL(req.url);
    seen.push(`${url.pathname} ${req.headers.get('authorization') ?? ''}`);
    if (url.pathname === '/api/v1/recruiter/vacancies') {
      return Response.json({ items: [{ id: 'vac-1' }, { id: 'vac-2' }], nextCursor: null });
    }
    if (url.pathname === '/api/v1/employer/vacancies') {
      return Response.json({ success: false, error: { code: 'FORBIDDEN' } }, { status: 403 });
    }
    return Response.json({ items: [] });
  },
});
afterAll(() => server.stop(true));

test('первый id доступного списка; закрытый и пустой — null; недопустимый путь не запрашивается', async () => {
  const got = await fetchSampleIds(`http://127.0.0.1:${server.port}/`, 'tok', ['/api/v1/recruiter/vacancies', '/api/v1/employer/vacancies', '/api/v1/recruiter/applications', 'http://evil/x']);
  expect(got).toEqual({ '/api/v1/recruiter/vacancies': 'vac-1', '/api/v1/employer/vacancies': null, '/api/v1/recruiter/applications': null });
  expect(seen.every((s) => s.endsWith('Bearer tok'))).toBe(true);
  expect(seen.length).toBe(3);
});
