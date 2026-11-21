/**
 * Замечания к экранам: `<lamDir>/comments/<id>/`.
 *
 * Каждое изменение — отдельный файл-событие, который пишется один раз и
 * больше не меняется (`<время>-<случайное>-<тип>.json`): визуализатор и
 * агент дописывают события в одну ветку, но никогда не пишут один и тот же
 * файл. Ветка (текст, статус, ответы) — чистая свёртка событий по времени.
 * Снимок компонента — `shot.png` рядом.
 */
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { MAX_SNAPSHOT_BYTES } from './agent-state';

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

const createdSchema = z.object({
  type: z.literal('created'),
  at: z.string().min(1),
  author: commentAuthorSchema,
  text: z.string().min(1),
  anchor: commentAnchorSchema,
  /** Имя файла снимка в папке ветки или null. */
  shot: z.string().nullable(),
});

const replySchema = z.object({
  type: z.literal('reply'),
  at: z.string().min(1),
  author: commentAuthorSchema,
  text: z.string().min(1),
  /** Изменённые файлы (от корня репозитория). */
  files: z.array(z.string()),
  commit: z.string().nullable(),
});

const statusSchema = z.object({
  type: z.literal('status'),
  at: z.string().min(1),
  author: commentAuthorSchema,
  status: commentStatusSchema,
  note: z.string().nullable(),
});

const eventSchema = z.discriminatedUnion('type', [createdSchema, replySchema, statusSchema]);

/** Событие ветки. */
export type CommentEvent = z.infer<typeof eventSchema>;

/** Новое событие (время ставит хранилище). */
export type NewCommentEvent =
  | Omit<z.infer<typeof replySchema>, 'at'>
  | Omit<z.infer<typeof statusSchema>, 'at'>;

/** Ветка замечания — свёртка событий. */
export type CommentThread = {
  readonly id: string;
  readonly author: CommentAuthor;
  readonly text: string;
  readonly anchor: CommentAnchor;
  readonly shot: string | null;
  readonly status: CommentStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** Все события по времени, первое — created. */
  readonly events: readonly CommentEvent[];
};

/** Что нужно для нового замечания. */
export type NewComment = {
  /** id от клиента: повтор с тем же id не создаёт вторую ветку. */
  readonly id: string;
  readonly author: CommentAuthor;
  readonly text: string;
  readonly anchor: CommentAnchor;
  /** PNG в data URL или null. */
  readonly shotDataUrl: string | null;
};

/** Фильтр списка. */
export type CommentFilter = {
  readonly status?: CommentStatus;
  readonly pageId?: string;
  readonly mapName?: string;
  readonly author?: CommentAuthor;
  /** Подстрока текста ветки, экрана или компонента, без учёта регистра. */
  readonly query?: string;
};

const ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
const PNG_PREFIX = 'data:image/png;base64,';

/**
 * Новый id замечания.
 */
export function newCommentId(): string {
  return randomUUID();
}

function commentsDir(lamDir: string): string {
  return path.join(lamDir, 'comments');
}

function threadDir(lamDir: string, id: string): string {
  if (!ID_RE.test(id)) {
    throw new Error(`неверный id замечания: ${id}`);
  }
  return path.join(commentsDir(lamDir), id);
}

function writeOnce(file: string, value: unknown): void {
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  renameSync(tmp, file);
}

function eventFile(dir: string, event: CommentEvent): string {
  const stamp = event.at.replace(/[:.]/g, '-');
  return path.join(dir, `${stamp}-${randomUUID().slice(0, 8)}-${event.type}.json`);
}

function readEvents(dir: string): CommentEvent[] {
  if (!existsSync(dir)) {
    return [];
  }
  const events: CommentEvent[] = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.json')) {
      continue;
    }
    try {
      const parsed = eventSchema.safeParse(JSON.parse(readFileSync(path.join(dir, name), 'utf8')));
      if (parsed.success) {
        events.push(parsed.data);
      }
    } catch {
      // Битый файл (обрыв записи чужим инструментом) — пропускаем, ветка цела.
    }
  }
  // Одно время у двух событий — порядок записи сохраняет created первым.
  return events.sort((a, b) => a.at.localeCompare(b.at) || rank(a) - rank(b));
}

function rank(e: CommentEvent): number {
  return e.type === 'created' ? 0 : 1;
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
    createdAt: created.at,
    updatedAt: events[events.length - 1]?.at ?? created.at,
    events,
  };
}

function saveShot(dir: string, dataUrl: string): string {
  if (!dataUrl.startsWith(PNG_PREFIX)) {
    throw new Error('снимок должен быть PNG в data URL');
  }
  const png = Buffer.from(dataUrl.slice(PNG_PREFIX.length), 'base64');
  if (png.length === 0 || png.length > MAX_SNAPSHOT_BYTES) {
    throw new Error(`снимок пустой или больше ${MAX_SNAPSHOT_BYTES} байт`);
  }
  writeFileSync(path.join(dir, 'shot.png'), png);
  return 'shot.png';
}

/**
 * Создаёт замечание. Повтор с тем же id возвращает существующую ветку.
 *
 * @param lamDir - папка обмена
 * @param input - замечание
 * @param now - время (для тестов)
 * @throws Error если текст пустой, id неверный или снимок не PNG
 */
export function createComment(lamDir: string, input: NewComment, now: Date = new Date()): CommentThread {
  const dir = threadDir(lamDir, input.id);
  const existing = foldThread(input.id, readEvents(dir));
  if (existing !== null) {
    return existing;
  }
  const text = input.text.trim();
  if (text === '') {
    throw new Error('текст замечания пустой: напишите, что не так');
  }
  const anchor = commentAnchorSchema.parse(input.anchor);
  mkdirSync(dir, { recursive: true });
  const shot = input.shotDataUrl === null ? null : saveShot(dir, input.shotDataUrl);
  const event: CommentEvent = { type: 'created', at: now.toISOString(), author: input.author, text, anchor, shot };
  writeOnce(eventFile(dir, event), event);
  const thread = foldThread(input.id, [event]);
  if (thread === null) {
    throw new Error('ветка не собралась');
  }
  return thread;
}

/**
 * Дописывает событие (ответ или смену статуса) в ветку.
 *
 * @param lamDir - папка обмена
 * @param id - id ветки
 * @param input - событие
 * @param now - время (для тестов)
 * @returns ветка после события
 * @throws Error если ветки нет или текст ответа пустой
 */
export function addCommentEvent(
  lamDir: string,
  id: string,
  input: NewCommentEvent,
  now: Date = new Date(),
): CommentThread {
  const dir = threadDir(lamDir, id);
  const events = readEvents(dir);
  if (foldThread(id, events) === null) {
    throw new Error(`замечание ${id} не найдено`);
  }
  const event = eventSchema.parse({ ...input, ...(input.type === 'reply' ? { text: input.text.trim() } : {}), at: now.toISOString() });
  writeOnce(eventFile(dir, event), event);
  const thread = foldThread(id, [...events, event]);
  if (thread === null) {
    throw new Error(`замечание ${id} не найдено`);
  }
  return thread;
}

/**
 * Ветка по id или null.
 *
 * @param lamDir - папка обмена
 * @param id - id ветки
 */
export function readComment(lamDir: string, id: string): CommentThread | null {
  if (!ID_RE.test(id)) {
    return null;
  }
  return foldThread(id, readEvents(threadDir(lamDir, id)));
}

/**
 * Путь к снимку ветки или null.
 *
 * @param lamDir - папка обмена
 * @param thread - ветка
 */
export function commentShotPath(lamDir: string, thread: CommentThread): string | null {
  return thread.shot === null ? null : path.join(threadDir(lamDir, thread.id), thread.shot);
}

function matches(thread: CommentThread, filter: CommentFilter): boolean {
  if (filter.status !== undefined && thread.status !== filter.status) {
    return false;
  }
  if (filter.pageId !== undefined && thread.anchor.pageId !== filter.pageId) {
    return false;
  }
  if (filter.mapName !== undefined && thread.anchor.mapName !== filter.mapName) {
    return false;
  }
  if (filter.author !== undefined && thread.author !== filter.author) {
    return false;
  }
  const q = filter.query?.trim().toLowerCase() ?? '';
  if (q === '') {
    return true;
  }
  const hay = [
    ...thread.events.map((e) => (e.type === 'status' ? (e.note ?? '') : e.text)),
    thread.anchor.pageTitle,
    thread.anchor.element?.text ?? '',
    thread.anchor.element?.component?.name ?? '',
  ].join('\n').toLowerCase();
  return hay.includes(q);
}

/**
 * Ветки по фильтру, свежие (по последнему событию) сверху.
 *
 * @param lamDir - папка обмена
 * @param filter - фильтр
 */
export function listComments(lamDir: string, filter: CommentFilter): readonly CommentThread[] {
  const root = commentsDir(lamDir);
  if (!existsSync(root)) {
    return [];
  }
  const threads: CommentThread[] = [];
  for (const id of readdirSync(root)) {
    if (!ID_RE.test(id)) {
      continue;
    }
    const thread = foldThread(id, readEvents(path.join(root, id)));
    if (thread !== null && matches(thread, filter)) {
      threads.push(thread);
    }
  }
  return threads.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
