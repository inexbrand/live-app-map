import { Elysia, t } from 'elysia';
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

/** Ошибка домена с кодом. */
class DomainError extends Error {}

type Viewer = { readonly id: string; readonly role: string };

function resolveViewer(request: Request): Viewer | null {
  return request.headers.get('x-user-id') === null ? null : { id: '1', role: 'admin' };
}

function requirePermission(user: unknown, permission: string): void {
  if (user === undefined) {
    throw new DomainError(permission);
  }
}

/** Проверка доступа к админке вакансий. */
function requireAdminAccess(user: unknown): void {
  requirePermission(user, 'admin.access');
  requirePermission(user, 'admin.vacancies.write');
}

function requirePermissionPlugin(permission: string): Elysia {
  return new Elysia().onBeforeHandle(() => {
    void permission;
  });
}

const LEVELS = ['junior', 'senior'] as const;

const CreateVacancyBody = t.Object({
  level: t.Union(LEVELS.map((v) => t.Literal(v))),
  title: t.String({ minLength: 1 }),
  salary: t.Optional(t.Number()),
  tags: t.Array(t.String()),
  status: t.Union([t.Literal('draft'), t.Literal('open')]),
});

export const app = new Elysia({ prefix: '/api' })
  // Вакансия заказчика.
  .get(
    '/me/vacancies/:vacancyId',
    ({ request, params }) => {
      const viewer = resolveViewer(request);
      if (!viewer) throw new DomainError('UNAUTHORIZED');
      if (viewer.role !== 'employer' && viewer.role !== 'admin') {
        throw new DomainError('FORBIDDEN');
      }
      return params.vacancyId;
    },
    { params: t.Object({ vacancyId: t.String() }) },
  )
  // Создаёт вакансию из админки.
  .post(
    '/admin/vacancies',
    ({ body, store }: { body: unknown; store: { user: unknown } }) => {
      requireAdminAccess(store.user);
      return body;
    },
    { body: CreateVacancyBody, query: t.Object({ dryRun: t.Optional(t.Boolean()) }) },
  )
  .get('/public/health', () => 'ok')
  .use(requirePermissionPlugin('reports.read'))
  .get('/admin/reports', () => []);

export const hono = new Hono().post(
  '/api/hono/items',
  zValidator('json', z.object({ name: z.string().min(1), count: z.number().int().optional(), kind: z.enum(['a', 'b']) })),
  (c) => c.json({}),
);
