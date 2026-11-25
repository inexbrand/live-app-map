/**
 * Исходник объявления для браузера: `GET /__lam_project/source?file=&line=`
 * (файл от корня проекта, строка начала объявления) → {@link SourceSnippet}.
 */
import { z } from 'zod';

/** Адрес исходника объявления. */
export const PROJECT_SOURCE_PATH = '/__lam_project/source';

/** Объявление целиком: с JSDoc над ним, строки с 1. */
export const sourceSnippetSchema = z.object({
  file: z.string(),
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  text: z.string(),
});
/** Объявление из файла. */
export type SourceSnippet = z.infer<typeof sourceSnippetSchema>;
