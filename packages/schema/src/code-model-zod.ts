/**
 * Zod-схема раздела `code` (formatVersion 2).
 */
import { z } from 'zod';

const sourceLocationSchema = z
  .object({ file: z.string().min(1), line: z.number().int().positive() })
  .strict();

const commentFields = {
  doc: z.string().optional(),
  comments: z.array(z.string()).optional(),
};

const ormSchema = z.enum(['drizzle', 'prisma']);

const dbCallSchema = z
  .object({
    orm: ormSchema,
    operation: z.enum(['select', 'insert', 'update', 'delete', 'upsert', 'count']),
    table: z.string().min(1),
    location: sourceLocationSchema,
    via: z.string().optional(),
    inLoop: z.boolean().optional(),
  })
  .strict();

const httpMethodSchema = z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD', 'ALL']);

const apiCallSchema = z
  .object({
    id: z.string().min(1),
    serviceId: z.string().min(1),
    method: httpMethodSchema,
    path: z.string().min(1),
    client: z.enum(['fetch', 'axios', 'ky', 'eden', 'hono-rpc', 'wrapper']),
    via: z.string().optional(),
    location: sourceLocationSchema,
    routeId: z.string().optional(),
  })
  .strict();

const screenApiSchema = z
  .object({
    nodeId: z.string().min(1).optional(),
    file: z.string().min(1),
    calls: z.array(z.object({ callId: z.string().min(1), via: z.string().optional() }).strict()),
  })
  .strict();

/** Схема раздела `code` документа карты. */
export const codeModelSchema = z
  .object({
    root: z.string().min(1),
    services: z.array(
      z.object({ id: z.string().min(1), name: z.string().min(1), root: z.string() }).strict(),
    ),
    symbols: z.array(
      z
        .object({
          id: z.string().min(1),
          kind: z.enum(['function', 'class', 'component', 'variable', 'interface', 'type']),
          name: z.string().min(1),
          serviceId: z.string().min(1),
          location: sourceLocationSchema,
          signature: z.string().optional(),
          ...commentFields,
        })
        .strict(),
    ),
    routes: z.array(
      z
        .object({
          id: z.string().min(1),
          framework: z.enum(['elysia', 'hono', 'express']),
          method: httpMethodSchema,
          path: z.string(),
          serviceId: z.string().min(1),
          location: sourceLocationSchema,
          handler: z
            .object({ name: z.string().optional(), location: sourceLocationSchema })
            .strict(),
          dbCalls: z.array(dbCallSchema),
          ...commentFields,
        })
        .strict(),
    ),
    tables: z.array(
      z
        .object({
          id: z.string().min(1),
          orm: ormSchema,
          name: z.string().min(1),
          exportName: z.string().min(1),
          serviceId: z.string().min(1),
          location: sourceLocationSchema,
          columns: z.array(
            z
              .object({
                name: z.string().min(1),
                sqlName: z.string().optional(),
                type: z.string(),
              })
              .strict(),
          ),
          ...commentFields,
        })
        .strict(),
    ),
    apiCalls: z.array(apiCallSchema).optional(),
    screens: z.array(screenApiSchema).optional(),
  })
  .strict();
