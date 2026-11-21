/**
 * Zod-схема раздела `docs`.
 */
import { z } from 'zod';

const docFileSchema = z
  .object({ path: z.string().min(1), title: z.string(), text: z.string() })
  .strict();

/** Схема раздела `docs` документа карты. */
export const docsModelSchema = z
  .object({
    root: z.string().min(1),
    epochs: z.array(
      z
        .object({
          id: z.string().min(1),
          slug: z.string().min(1),
          date: z.string().optional(),
          dir: z.string().min(1),
          summary: z.string().optional(),
          declaredStatus: z.string().optional(),
          readiness: z.enum(['ready', 'not-ready', 'no-bugs-file']),
          openBugs: z.array(z.string()),
          files: z.array(docFileSchema),
          images: z.array(z.string()),
        })
        .strict(),
    ),
    notes: z.array(docFileSchema),
    guides: z.array(docFileSchema),
  })
  .strict();
