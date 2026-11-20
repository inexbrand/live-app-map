import { Elysia } from 'elysia';
import { db } from './db';
import { posts, users } from '@fx/db';
import { findUserById } from './repo';

/** Пакетная выдача — с запросами в цикле (N+1). */
export const batchPlugin = new Elysia().post('/users/batch', async ({ body }: { body: { ids: string[] } }) => {
  for (const id of body.ids) {
    await db.select().from(users).where(id);
  }
  const found = await Promise.all(body.ids.map((id) => findUserById(id)));
  const all = await db.select().from(posts);
  return { found, all };
});
