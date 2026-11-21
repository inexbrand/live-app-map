import { integer, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/** Статусы поста. */
export const POST_STATUSES = ['draft', 'published'] as const;

/**
 * Пользователи сервиса. Одна строка — один аккаунт.
 */
export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  email: text('email').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow(),
});

// Посты пользователей.
export const posts = pgTable('blog_posts', {
  id: integer('id').primaryKey(),
  /** Автор поста. */
  authorId: uuid('author_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: text('title'),
  status: text('status', { enum: POST_STATUSES }).notNull().default('draft'),
});

/** Теги поста: составной первичный ключ. */
export const postTags = pgTable(
  'post_tags',
  {
    postId: integer('post_id').notNull().references(() => posts.id),
    tag: text('tag').notNull(),
  },
  (t) => [primaryKey({ columns: [t.postId, t.tag] })],
);
