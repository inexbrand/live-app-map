import express from 'express';
import { prisma } from './prisma';

const app = express();
const router = express.Router();

/** Число заказов. */
router.get('/orders/count', async (_req, res) => {
  res.json(await prisma.order.count());
});

// Отменяет заказ.
app.delete('/orders/:id', auth, async (req, res) => {
  await prisma.order.delete({ where: { id: Number(req.params.id) } });
  res.sendStatus(204);
});

function auth(_req: unknown, _res: unknown, next: () => void): void {
  next();
}

app.use('/v1', router);
