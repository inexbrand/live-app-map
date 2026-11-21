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

/** Фильтр аудитории рассылки. */
const AudienceFilter = t.Object({
  roles: t.Array(t.Union([t.Literal('recruiter'), t.Literal('employer')])),
  city: t.Optional(t.Object({ id: t.String({ format: 'uuid' }) })),
});

const MarkupKind = t.Union([t.Literal('html'), t.Literal('markdown')]);

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
  // Рассылка: необязательное тело, вложенный объект по имени константы, массив объектов.
  .post('/admin/broadcasts', ({ body }) => body, {
    body: t.Optional(
      t.Object({
        audience: t.Optional(AudienceFilter),
        recipients: t.Array(t.Object({ id: t.String({ minLength: 1 }), weight: t.Optional(t.Number({ minimum: 0 })) })),
        markup: MarkupKind,
      }),
    ),
  })
  .get('/admin/registry/:name', ({ query }) => query, { query: t.Record(t.String(), t.String()) })
  .patch('/admin/presets/:id', ({ body }) => body, { body: t.Unknown() })
  .put('/admin/profile', ({ body }) => body, { body: t.Partial(t.Object({ name: t.String(), age: t.Integer() })) })
  .get('/public/health', () => 'ok')
  .use(requirePermissionPlugin('reports.read'))
  .get('/admin/reports', () => []);

export const hono = new Hono()
  .post(
    '/api/hono/items',
    zValidator('json', z.object({ name: z.string().min(1), count: z.number().int().optional(), kind: z.enum(['a', 'b']) })),
    (c) => c.json({}),
  )
  .post(
    '/api/hono/orders',
    zValidator('json', z.object({ lines: z.array(z.object({ sku: z.string().max(32), qty: z.number().int().min(1) })), note: z.string().optional() })),
    (c) => c.json({}),
  );
