import { eq } from 'drizzle-orm';
import { db } from './db';
import { users } from '@fx/db';

/**
 * Ищет пользователя по id.
 *
 * @param id - id пользователя
 */
export async function findUserById(id: string): Promise<unknown> {
  return db.select().from(users).where(eq(users.id, id));
}
