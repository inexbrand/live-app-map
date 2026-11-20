import { Hono } from 'hono';
import { prisma } from './prisma';

const app = new Hono();

// Проверка живости.
app.get('/health', (c) => c.text('ok'));

/** Оформляет заказ. */
app.post('/orders', async (c) => {
  const order = await prisma.order.create({ data: {} });
  return c.json(order);
});

export default app;
