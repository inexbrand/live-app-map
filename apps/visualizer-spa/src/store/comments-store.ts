/**
 * Замечания в визуализаторе: ветки текущей карты (с dev-сервера), цель окна у
 * компонента (экран и элемент), черновики неотправленного текста, лист всех
 * замечаний и решения пользователя по ответам агента.
 */
import {
  commentAnchorSchema,
  commentThreadSchema,
  type CommentAnchor,
  type CommentStage,
  type CommentThread,
} from '@live-app-map/mcp-server/comments-schema';
import { z } from 'zod';
import { create } from 'zustand';
import { anyBody, requestJson } from '../lib/dev-api';
import type { Rect } from '../lib/snapshot/region';

/** Где элемент на странице: рамка в окне страницы (CSS px) и ширина окна страницы. */
export type PageFrame = {
  readonly rect: Rect;
  readonly pageWidth: number;
};

/** Цель окна замечания: экран и элемент (или экран целиком), его место и снимок. */
export type CommentTarget = {
  readonly anchor: CommentAnchor;
  /** null — экран целиком: окно встаёт у верха экрана. */
  readonly frame: PageFrame | null;
  /** Снимок компонента (PNG data URL) или null. */
  readonly shot: string | null;
};

/** Неотправленный текст к цели. */
export type CommentDraft = {
  readonly anchor: CommentAnchor;
  readonly frame: PageFrame | null;
  readonly text: string;
};

/** Решение пользователя по ответу агента. */
export type CommentReview = { readonly kind: 'accept' } | { readonly kind: 'reject'; readonly note: string | null };

type CommentsState = {
  readonly mapName: string | null;
  readonly threads: readonly CommentThread[];
  readonly loadError: string | null;
  readonly target: CommentTarget | null;
  /** Черновики по ключу цели (targetKey). */
  readonly drafts: ReadonlyMap<string, CommentDraft>;
  readonly saving: boolean;
  readonly saveError: string | null;
  readonly sheetOpen: boolean;
  /** Фильтр листа по экрану; null — все экраны. */
  readonly sheetPage: string | null;
  readonly query: string;
  /** Ветка, к которой перешли (подсветка метки и в окне). */
  readonly focusId: string | null;
  readonly setMapName: (name: string | null) => void;
  readonly refresh: () => Promise<void>;
  readonly openTarget: (target: CommentTarget) => void;
  readonly closeTarget: () => void;
  /** Текст черновика текущей цели; пустой — черновик удаляется. */
  readonly setDraftText: (text: string) => void;
  /** Отправить замечание к текущей цели; true — сохранено. */
  readonly save: (text: string) => Promise<boolean>;
  readonly review: (id: string, review: CommentReview) => Promise<void>;
  readonly openSheet: (pageId: string | null) => void;
  readonly closeSheet: () => void;
  readonly setQuery: (query: string) => void;
  readonly focus: (id: string | null) => void;
};

const listSchema = z.object({ comments: z.array(commentThreadSchema) });
const oneSchema = z.object({ comment: commentThreadSchema });

/** Ключ localStorage черновиков: только неотправленный текст пользователя, агенту не нужен. */
export const DRAFTS_KEY = 'lam:comment-drafts:v1';

const rectSchema = z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() });
const draftsSchema = z.array(
  z.object({
    anchor: commentAnchorSchema,
    frame: z.object({ rect: rectSchema, pageWidth: z.number().positive() }).nullable(),
    text: z.string().min(1),
  }),
);

/**
 * Ключ цели: экран и селектор элемента (пусто — экран целиком).
 *
 * @param anchor - привязка
 */
export function targetKey(anchor: Pick<CommentAnchor, 'pageId' | 'element'>): string {
  return `${anchor.pageId}|${anchor.element?.selector ?? ''}`;
}

/**
 * Ветки той же цели, что у привязки (тот же экран и элемент), старые сверху.
 *
 * @param threads - ветки карты
 * @param anchor - привязка цели
 */
export function threadsFor(threads: readonly CommentThread[], anchor: Pick<CommentAnchor, 'pageId' | 'element'>): readonly CommentThread[] {
  const key = targetKey(anchor);
  return threads.filter((t) => targetKey(t.anchor) === key).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function loadDrafts(): ReadonlyMap<string, CommentDraft> {
  const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(DRAFTS_KEY);
  let parsed: unknown = null;
  try {
    parsed = raw === null ? [] : JSON.parse(raw);
  } catch {
    parsed = [];
  }
  const ok = draftsSchema.safeParse(parsed);
  return new Map((ok.success ? ok.data : []).map((d) => [targetKey(d.anchor), d]));
}

function storeDrafts(drafts: ReadonlyMap<string, CommentDraft>): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(DRAFTS_KEY, JSON.stringify([...drafts.values()]));
  }
}

function signature(threads: readonly CommentThread[]): string {
  return threads.map((t) => `${t.id}@${t.updatedAt}`).join('|');
}

function withDraft(drafts: ReadonlyMap<string, CommentDraft>, target: CommentTarget, text: string): ReadonlyMap<string, CommentDraft> {
  const next = new Map(drafts);
  const key = targetKey(target.anchor);
  if (text.trim() === '') {
    next.delete(key);
  } else {
    next.set(key, { anchor: target.anchor, frame: target.frame, text });
  }
  return next;
}

function eventBody(review: CommentReview): Record<string, unknown> {
  return review.kind === 'accept'
    ? { type: 'status', status: 'fixed', note: null }
    : { type: 'status', status: 'open', note: review.note === null || review.note.trim() === '' ? null : review.note.trim() };
}

/** Store замечаний. */
export const useCommentsStore = create<CommentsState>((set, get) => ({
  mapName: null,
  threads: [],
  loadError: null,
  target: null,
  drafts: loadDrafts(),
  saving: false,
  saveError: null,
  sheetOpen: false,
  sheetPage: null,
  query: '',
  focusId: null,
  setMapName: (mapName) => {
    if (mapName !== get().mapName) {
      set({ mapName, threads: [], focusId: null, target: null });
      void get().refresh();
    }
  },
  refresh: async () => {
    const { mapName } = get();
    if (mapName === null) {
      return;
    }
    const r = await requestJson(`/api/comments?mapName=${encodeURIComponent(mapName)}`);
    if (!r.ok && r.status === null) {
      set({ loadError: r.error });
      return;
    }
    const parsed = listSchema.safeParse(anyBody(r));
    if (!parsed.success) {
      set({ loadError: 'ответ /api/comments не по схеме' });
      return;
    }
    if (get().mapName === mapName && signature(parsed.data.comments) !== signature(get().threads)) {
      set({ threads: parsed.data.comments, loadError: null });
    }
  },
  openTarget: (target) => set({ target, saveError: null }),
  closeTarget: () => set({ target: null, saveError: null }),
  setDraftText: (text) => {
    const { target, drafts } = get();
    if (target !== null) {
      const next = withDraft(drafts, target, text);
      set({ drafts: next });
      storeDrafts(next);
    }
  },
  save: async (text) => {
    const target = get().target;
    if (target === null) {
      return false;
    }
    if (text.trim() === '') {
      set({ saveError: 'Напишите, что не так — или скажите голосом' });
      return false;
    }
    set({ saving: true, saveError: null });
    const r = await requestJson('/api/comments', {
      method: 'POST',
      json: { id: crypto.randomUUID(), text, anchor: target.anchor, shotDataUrl: target.shot },
    });
    if (!r.ok) {
      set({ saveError: r.error, saving: false });
      return false;
    }
    const parsed = oneSchema.safeParse(r.value);
    const drafts = withDraft(get().drafts, target, '');
    storeDrafts(drafts);
    set({
      drafts,
      saving: false,
      ...(parsed.success ? { threads: [parsed.data.comment, ...get().threads.filter((t) => t.id !== parsed.data.comment.id)], focusId: parsed.data.comment.id } : {}),
    });
    return true;
  },
  review: async (id, review) => {
    const r = await requestJson(`/api/comments/${encodeURIComponent(id)}/events`, { method: 'POST', json: eventBody(review) });
    if (!r.ok) {
      throw new Error(r.error);
    }
    const parsed = oneSchema.safeParse(r.value);
    if (parsed.success) {
      set({ threads: get().threads.map((t) => (t.id === id ? parsed.data.comment : t)) });
    }
  },
  openSheet: (sheetPage) => set({ sheetOpen: true, sheetPage }),
  closeSheet: () => set({ sheetOpen: false }),
  setQuery: (query) => set({ query }),
  focus: (focusId) => set({ focusId }),
}));

/** Группы листа по этапу. */
export type StageGroups = Readonly<Record<CommentStage, readonly CommentThread[]>>;

/** Текст, по которому ищет лист: замечание, экран, компонент, текст элемента, ответы. */
function searchText(t: CommentThread): string {
  const el = t.anchor.element;
  const replies = t.events.flatMap((e) => (e.type === 'reply' ? [e.text] : []));
  return [t.text, t.anchor.pageTitle, el?.component?.name ?? '', el?.text ?? '', ...replies].join(' ').toLowerCase();
}

/**
 * Ветки листа по этапам: фильтр экрана и поиск; «проверьте» и «ждут» — свежие сверху.
 *
 * @param threads - ветки карты
 * @param pageId - экран или null
 * @param query - поиск
 */
export function groupByStage(threads: readonly CommentThread[], pageId: string | null, query: string): StageGroups {
  const q = query.trim().toLowerCase();
  const shown = threads
    .filter((t) => (pageId === null || t.anchor.pageId === pageId) && (q === '' || searchText(t).includes(q)))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return {
    review: shown.filter((t) => t.stage === 'review'),
    waiting: shown.filter((t) => t.stage === 'waiting'),
    done: shown.filter((t) => t.stage === 'done'),
  };
}
