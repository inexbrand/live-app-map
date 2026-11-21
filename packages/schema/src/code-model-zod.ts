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

/** Поле схемы входа; вложенные поля — той же формы. */
export type RouteSchemaFieldShape = {
  name: string;
  type: string;
  optional?: boolean;
  rules?: string[];
  fields?: RouteSchemaFieldShape[];
};

const routeSchemaFieldSchema: z.ZodType<RouteSchemaFieldShape> = z.lazy(() =>
  z
    .object({
      name: z.string().min(1),
      type: z.string(),
      optional: z.boolean().optional(),
      rules: z.array(z.string()).optional(),
      fields: z.array(routeSchemaFieldSchema).optional(),
    })
    .strict(),
);

const routeInputSchemaSchema = z
  .object({
    kind: z.enum(['typebox', 'zod']),
    name: z.string().optional(),
    fields: z.array(routeSchemaFieldSchema),
    text: z.string().optional(),
    optional: z.boolean().optional(),
    type: z.string().optional(),
  })
  .strict();

const routeInputSchema = z
  .object({
    body: routeInputSchemaSchema.optional(),
    query: routeInputSchemaSchema.optional(),
    params: routeInputSchemaSchema.optional(),
    headers: routeInputSchemaSchema.optional(),
  })
  .strict();

const routeAccessSchema = z
  .object({
    auth: z.boolean().optional(),
    roles: z.array(z.string()).optional(),
    permissions: z.array(z.string()).optional(),
    checks: z.array(z.string()).optional(),
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

const routeResponseSchema = z
  .object({
    fields: z.array(z.string()).optional(),
    values: z.array(z.string()).optional(),
    statuses: z.array(z.number().int()).optional(),
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
          input: routeInputSchema.optional(),
          access: routeAccessSchema.optional(),
          response: routeResponseSchema.optional(),
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
                primaryKey: z.boolean().optional(),
                notNull: z.boolean().optional(),
                unique: z.boolean().optional(),
                default: z.string().optional(),
                enumValues: z.array(z.string()).optional(),
                references: z
                  .object({ table: z.string().min(1), column: z.string().min(1), onDelete: z.string().optional() })
                  .strict()
                  .optional(),
                doc: z.string().optional(),
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
