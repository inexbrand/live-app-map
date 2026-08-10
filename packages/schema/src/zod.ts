/**
 * Zod-схемы границ документа Live App Map.
 */
import { z } from 'zod';

export const stateInjectSpecSchema = z
  .object({
    query: z.record(z.string()).optional(),
    hash: z.string().optional(),
    localStorage: z.record(z.string()).optional(),
    sessionStorage: z.record(z.string()).optional(),
    role: z.string().optional(),
    labels: z.array(z.string()).optional(),
  })
  .strict();

export const appMapPageStateSchema = z
  .object({
    name: z.string().min(1),
    url: z.string().optional(),
    screenshot: z.string().nullable().optional(),
    note: z.string().optional(),
    inject: stateInjectSpecSchema.optional(),
  })
  .passthrough();

export const appMapNodeSchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum([
      'page',
      'layout',
      'route-handler',
      'intercept',
      'not-found',
      'external',
      'unknown',
    ]),
    title: z.string(),
    pathPattern: z.string(),
    pathExample: z.string().optional(),
    url: z.string().optional(),
    source: z
      .object({
        file: z.string(),
        exportName: z.string().optional(),
      })
      .optional(),
    groupIds: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
    dynamicParams: z.array(z.string()).optional(),
    parallelSlot: z.string().nullable().optional(),
    intercept: z
      .object({
        type: z.string(),
        targetPathPattern: z.string().optional(),
      })
      .nullable()
      .optional(),
    presentation: z.enum(['page', 'modal', 'intercept', 'slot']).optional(),
    iframePolicy: z
      .object({
        enabled: z.boolean(),
        reason: z.string().optional(),
      })
      .optional(),
    metadata: z.record(z.unknown()).optional(),
    position: z
      .object({
        x: z.number(),
        y: z.number(),
      })
      .optional(),
    viewport: z
      .object({
        width: z.number().positive(),
        height: z.number().positive(),
        label: z.string().optional(),
      })
      .optional(),
    states: z.array(appMapPageStateSchema).optional(),
    defaultPinned: z.boolean().optional(),
    screenshot: z.string().nullable().optional(),
  })
  .passthrough();

export const appMapEdgeSchema = z
  .object({
    id: z.string().min(1),
    from: z.string().min(1),
    to: z.string().nullable(),
    kind: z.string(),
    confidence: z.enum(['high', 'medium', 'low']),
    label: z.string().optional(),
    raw: z.string().optional(),
    source: z
      .object({
        file: z.string(),
        line: z.number(),
        column: z.number(),
      })
      .optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .passthrough();

export const appMapGroupSchema = z
  .object({
    id: z.string().min(1),
    title: z.string(),
    color: z.string().optional(),
    order: z.number().optional(),
  })
  .passthrough();

export const appMapDocumentSchema = z
  .object({
    formatVersion: z.literal(1),
    kind: z.literal('live-app-map'),
    generatedAt: z.string(),
    generator: z.object({
      name: z.string(),
      version: z.string(),
    }),
    revision: z.string(),
    project: z.object({
      name: z.string().optional(),
      root: z.string(),
      framework: z.enum(['next', 'react-router', 'hybrid', 'unknown', 'manual']),
      next: z
        .object({
          router: z.enum(['app', 'pages', 'hybrid']),
          basePath: z.string().optional(),
          monorepo: z.boolean().optional(),
        })
        .optional(),
    }),
    baseUrl: z.string().nullable(),
    nodes: z.array(appMapNodeSchema).min(1),
    edges: z.array(appMapEdgeSchema),
    groups: z.array(appMapGroupSchema).optional(),
    layout: z
      .object({
        algorithm: z.string().optional(),
        direction: z.enum(['TB', 'LR', 'BT', 'RL']).optional(),
        defaultViewport: z
          .object({
            x: z.number(),
            y: z.number(),
            zoom: z.number(),
          })
          .optional(),
      })
      .optional(),
    extensions: z.record(z.unknown()).optional(),
  })
  .passthrough();

export const liveAppMapPageSchema = z
  .object({
    id: z.string().min(1),
    title: z.string(),
    path: z.string().optional(),
    url: z.string().optional(),
    group: z.string().optional(),
    type: z.string().optional(),
    states: z.array(appMapPageStateSchema).optional(),
    screenshot: z.string().nullable().optional(),
    metadata: z.record(z.unknown()).optional(),
    position: z
      .object({
        x: z.number(),
        y: z.number(),
      })
      .optional(),
    viewport: z
      .object({
        width: z.number().positive(),
        height: z.number().positive(),
        label: z.string().optional(),
      })
      .optional(),
    iframeDisabled: z.boolean().optional(),
    defaultPinned: z.boolean().optional(),
  })
  .passthrough();

export const liveAppMapDocumentSchema = z
  .object({
    version: z.union([z.string(), z.number()]),
    app: z
      .object({
        name: z.string().optional(),
        description: z.string().optional(),
        platform: z.string().optional(),
        generatedAt: z.string().optional(),
        generator: z.string().optional(),
      })
      .passthrough()
      .optional(),
    baseUrl: z.string().optional(),
    pages: z.array(liveAppMapPageSchema).min(1),
    edges: z.array(
      z
        .object({
          id: z.string().optional(),
          from: z.string().min(1),
          to: z.string().min(1),
          label: z.string().optional(),
          kind: z.string().optional(),
          raw: z.string().optional(),
          metadata: z.record(z.unknown()).optional(),
        })
        .passthrough(),
    ),
    groups: z.array(appMapGroupSchema).optional(),
    layout: z.record(z.unknown()).optional(),
    extensions: z.record(z.unknown()).optional(),
  })
  .passthrough();
