/**
 * Формат замечаний к экранам: схемы событий и свёртка в ветку.
 * Без node-зависимостей — им пользуется и браузер (визуализатор).
 */
import { z } from 'zod';

const rectSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
});

const sourceSchema = z.object({
  file: z.string().min(1),
  line: z.number().int().positive().nullable(),
  /** Откуда известен исходник: карта кода или стек React (dev). */
  origin: z.enum(['code-map', 'react-stack']),
});

const componentSchema = z.object({
  /** Ближайший компонент React над элементом. */
  name: z.string().min(1),
  /** Компоненты от элемента вверх (до 8). */
  chain: z.array(z.string()),
  source: sourceSchema.nullable(),
});

/** Схема элемента, к которому привязано замечание. */
export const commentElementSchema = z.object({
  selector: z.string().min(1),
  domPath: z.string(),
  tag: z.string(),
  /** Видимый текст элемента (до 120 символов). */
  text: z.string(),
  /** Рамка в координатах документа страницы, CSS px. */
  rect: rectSchema,
  /** Окно страницы при выборе. */
  viewport: z.object({ width: z.number().positive(), height: z.number().positive() }),
  component: componentSchema.nullable(),
});

/** Схема привязки: экран и (если выбран) элемент. */
export const commentAnchorSchema = z.object({
  mapName: z.string().nullable(),
  pageId: z.string().min(1),
  pageTitle: z.string(),
  pageUrl: z.string().nullable(),
  role: z.string().nullable(),
  element: commentElementSchema.nullable(),
});

/** Привязка замечания. */
export type CommentAnchor = z.infer<typeof commentAnchorSchema>;

/** Кто пишет. */
export const commentAuthorSchema = z.enum(['user', 'agent']);
/** Автор события. */
export type CommentAuthor = z.infer<typeof commentAuthorSchema>;

/** Статус ветки. */
export const commentStatusSchema = z.enum(['open', 'fixed']);
/** Статус: открыто или исправлено. */
export type CommentStatus = z.infer<typeof commentStatusSchema>;

/** Этап ветки для проверки: ждёт агента, агент ответил — проверьте, пользователь принял. */
export const commentStageSchema = z.enum(['waiting', 'review', 'done']);
/** Этап: waiting — ждёт агента, review — проверьте, done — исправлено (принял пользователь). */
export type CommentStage = z.infer<typeof commentStageSchema>;

/** Номер события в ветке: created — 0, дальше по одному. Порядок не зависит от часов. */
const seqSchema = z.number().int().nonnegative();

const createdSchema = z.object({
  type: z.literal('created'),
  seq: seqSchema,
  at: z.string().min(1),
  author: commentAuthorSchema,
  text: z.string().min(1),
  anchor: commentAnchorSchema,
  /** Имя файла снимка в папке ветки или null. */
  shot: z.string().nullable(),
});

const replySchema = z.object({
  type: z.literal('reply'),
  seq: seqSchema,
  at: z.string().min(1),
  author: commentAuthorSchema,
  text: z.string().min(1),
  /** Изменённые файлы (от корня репозитория). */
  files: z.array(z.string()),
  commit: z.string().nullable(),
});

const statusSchema = z.object({
  type: z.literal('status'),
  seq: seqSchema,
  at: z.string().min(1),
  author: commentAuthorSchema,
  status: commentStatusSchema,
  note: z.string().nullable(),
});

/** Схема события ветки. */
export const commentEventSchema = z.discriminatedUnion('type', [createdSchema, replySchema, statusSchema]);

/** Событие ветки. */
export type CommentEvent = z.infer<typeof commentEventSchema>;

/** Новое событие (время ставит хранилище). */
export type NewCommentEvent =
  | Omit<z.infer<typeof replySchema>, 'at' | 'seq'>
  | Omit<z.infer<typeof statusSchema>, 'at' | 'seq'>;

/** Ветка замечания — свёртка событий. */
export type CommentThread = {
  readonly id: string;
  readonly author: CommentAuthor;
  readonly text: string;
  readonly anchor: CommentAnchor;
  readonly shot: string | null;
  readonly status: CommentStatus;
  /** Вычисляется из событий, на диске не хранится. */
  readonly stage: CommentStage;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** Все события по времени, первое — created. */
  readonly events: readonly CommentEvent[];
};


/** Схема ветки (ответ API). */
export const commentThreadSchema = z.object({
  id: z.string().min(1),
  author: commentAuthorSchema,
  text: z.string(),
  anchor: commentAnchorSchema,
  shot: z.string().nullable(),
  status: commentStatusSchema,
  stage: commentStageSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  events: z.array(commentEventSchema),
});

/** Сравнение событий: по номеру, при гонке двух писателей — по времени. */
export function compareEvents(a: CommentEvent, b: CommentEvent): number {
  return a.seq - b.seq || a.at.localeCompare(b.at);
}


/** Этап после события: действие агента — на проверку (кроме его «открыть снова»), пользователя — к агенту или закрыто. */
function stageAfter(e: CommentEvent): CommentStage {
  const reopened = e.type === 'status' && e.status === 'open';
  if (e.author === 'agent') {
    return reopened ? 'waiting' : 'review';
  }
  return e.type === 'status' && e.status === 'fixed' ? 'done' : 'waiting';
}

/**
 * Свёртка событий в ветку; null — нет события created.
 *
 * @param id - id ветки
 * @param events - события по времени
 */
export function foldThread(id: string, events: readonly CommentEvent[]): CommentThread | null {
  const created = events.find((e) => e.type === 'created');
  if (created === undefined || created.type !== 'created') {
    return null;
  }
  let status: CommentStatus = created.author === 'agent' ? 'fixed' : 'open';
  for (const e of events) {
    if (e.type === 'status') {
      status = e.status;
    }
  }
  return {
    id,
    author: created.author,
    text: created.text,
    anchor: created.anchor,
    shot: created.shot,
    status,
    stage: events.reduce<CommentStage>((_, e) => stageAfter(e), 'waiting'),
    createdAt: created.at,
    updatedAt: events[events.length - 1]?.at ?? created.at,
    events,
  };
}

