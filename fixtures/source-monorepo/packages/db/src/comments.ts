/**
 * Таблица `comments` — комментарии к постам.
 */
import { pgTable, text } from 'drizzle-orm/pg-core';

export const comments = pgTable('comments', {
  body: text('body'),
});
