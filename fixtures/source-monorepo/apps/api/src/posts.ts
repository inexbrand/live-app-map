import { Elysia } from 'elysia';
import { db } from './db';
import { posts } from '@fx/db';

/** Доступ к постам. */
export interface PostRepository {
  listByAuthor(authorId: string): Promise<unknown[]>;
}

/** Репозиторий постов на Drizzle. */
export function createDrizzlePostRepository(client: typeof db): PostRepository {
  return {
    async listByAuthor(authorId) {
      return client.select().from(posts).where(authorId);
    },
  };
}

/** Репозиторий в памяти для тестов — без БД. */
export class MemoryPostRepository implements PostRepository {
  async listByAuthor(): Promise<unknown[]> {
    return [];
  }
}

const repo: PostRepository = createDrizzlePostRepository(db);

/** Посты автора. */
export const postsPlugin = new Elysia().get('/users/:id/posts', ({ params }) => repo.listByAuthor(params.id));
