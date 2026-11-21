import { Elysia } from 'elysia';
import { db } from './db';
import { posts, users } from '@fx/db';
import { findUserById } from './repo';

/** Удаляет посты автора. */
async function purgePosts(authorId: string): Promise<void> {
  await db.delete(posts).where(authorId);
}

const USERS_PATH = '/users';

/**
 * Плагин пользователей.
 */
export const usersPlugin = new Elysia({ prefix: '/api' })
  // Список пользователей с постами.
  .get(USERS_PATH, async () => {
    const rows = await db.select().from(users);
    const all = await db.query.posts.findMany();
    return { rows, all };
  })
  /** Карточка пользователя по id. */
  .get('/users/:id', async ({ params, set }) => {
    const user = await findUserById(params.id);
    if (user === undefined) {
      set.status = 404;
      return { error: 'not_found' };
    }
    return user;
  })
  .group('/admin', (app) =>
    app.delete('/users/:id', async ({ params }) => {
      await purgePosts(params.id);
      await db.delete(users).where(params.id);
      return { ok: true };
    }),
  );

/**
 * Создаёт пользователя.
 */
async function createUser({ body }: { body: { email: string } }): Promise<unknown> {
  return db.insert(users).values(body);
}

/** Отдельный плагин записи. */
export function writePlugin() {
  const app = new Elysia();
  app.post('/users', createUser, { body: undefined });
  return app;
}
