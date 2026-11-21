import { Elysia, t } from 'elysia';
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

/** Фильтр аудитории рассылки. */
const AudienceFilter = t.Object({
  roles: t.Array(t.Union([t.Literal('recruiter'), t.Literal('employer')])),
  city: t.Optional(t.Object({ id: t.String({ format: 'uuid' }) })),
});

const MarkupKind = t.Union([t.Literal('html'), t.Literal('markdown')]);

/** Тело без полей: запрос без данных. */
const TakeBody = t.Optional(t.Object({}));

export const app = new Elysia({ prefix: '/api' })
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
  .post('/admin/take', ({ body }) => body, { body: TakeBody });

export const hono = new Hono().post(
  '/api/hono/orders',
  zValidator('json', z.object({ lines: z.array(z.object({ sku: z.string().max(32), qty: z.number().int().min(1) })), note: z.string().optional() })),
  (c) => c.json({}),
);