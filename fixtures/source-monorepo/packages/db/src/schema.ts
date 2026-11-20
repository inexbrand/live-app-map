import { integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Пользователи сервиса. Одна строка — один аккаунт.
 */
export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  email: text('email').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// Посты пользователей.
export const posts = pgTable('blog_posts', {
  id: integer('id').primaryKey(),
  authorId: uuid('author_id').notNull(),
  title: text('title'),
});
