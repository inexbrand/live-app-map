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
import { MAX_SNAPSHOT_BYTES } from './agent-state';
import {
  commentAnchorSchema,
  commentEventSchema,
  compareEvents,
  foldThread,
  type CommentAuthor,
  type CommentEvent,
  type CommentStatus,
  type CommentThread,
  type NewCommentEvent,
  type CommentAnchor,
} from './comments-schema';

export {
  commentAnchorSchema,
  commentAuthorSchema,
  commentElementSchema,
  commentEventSchema,
  commentStatusSchema,
  commentThreadSchema,
  foldThread,
} from './comments-schema';
export type { CommentAnchor, CommentAuthor, CommentEvent, CommentStatus, CommentThread, NewCommentEvent } from './comments-schema';

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
      const parsed = commentEventSchema.safeParse(JSON.parse(readFileSync(path.join(dir, name), 'utf8')));
      if (parsed.success) {
        events.push(parsed.data);
      }
    } catch {
      // Битый файл (обрыв записи чужим инструментом) — пропускаем, ветка цела.
    }
  }
  // Одно время у двух событий — порядок записи сохраняет created первым.
  return events.sort(compareEvents);
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
  const event: CommentEvent = { type: 'created', seq: 0, at: now.toISOString(), author: input.author, text, anchor, shot };
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
  const seq = Math.max(...events.map((e) => e.seq)) + 1;
  const event = commentEventSchema.parse({ ...input, ...(input.type === 'reply' ? { text: input.text.trim() } : {}), seq, at: now.toISOString() });
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
  const fields: readonly [unknown, unknown][] = [
    [filter.status, thread.status],
    [filter.pageId, thread.anchor.pageId],
    [filter.mapName, thread.anchor.mapName],
    [filter.author, thread.author],
  ];
  const q = filter.query?.trim().toLowerCase() ?? '';
  return fields.every(([want, have]) => want === undefined || want === have) && (q === '' || searchText(thread).includes(q));
}

/** Текст замечания для поиска: события, экран, элемент и его компонент — в нижнем регистре. */
function searchText(thread: CommentThread): string {
  const element = thread.anchor.element;
  return [
    ...thread.events.map((e) => (e.type === 'status' ? (e.note ?? '') : e.text)),
    thread.anchor.pageTitle,
    element?.text ?? '',
    element?.component?.name ?? '',
  ].join('\n').toLowerCase();
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
