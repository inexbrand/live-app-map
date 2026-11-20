/**
 * Публичный API `@live-app-map/scanner-source`: скан исходников через TypeScript
 * compiler API — сервисы, экспортируемые символы с комментариями, HTTP-роуты
 * (Elysia, Hono, Express), вызовы БД (Drizzle, Prisma), таблицы.
 */
export { scanSource } from './scan-source';
export type { SourceScanRequest, SourceScanResult } from './scan-source';
export { codeServiceNodes } from './service-nodes';
export { joinPath } from './routes';
export { cleanBlockComment, commentsAt } from './comments';
export { parsePrismaSchema } from './tables-prisma';
