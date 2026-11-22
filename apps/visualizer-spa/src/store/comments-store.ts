/**
 * Замечания в визуализаторе: ветки текущей карты (с dev-сервера), черновик
 * нового замечания у выбранного компонента, общий список с фильтрами.
 */
import {
  commentThreadSchema,
  type CommentAnchor,
  type CommentStatus,
  type CommentThread,
} from '@live-app-map/mcp-server/comments-schema';
import { z } from 'zod';
import { create } from 'zustand';
import { anyBody, requestJson } from '../lib/dev-api';
import type { Rect } from '../lib/snapshot/region';

/** Черновик: привязка, где показать поле, снимок (pending — ещё снимается). */
export type CommentDraft = {
  readonly anchor: CommentAnchor;
  readonly viewRect: Rect;
  readonly shot: 'pending' | string | null;
};

/** Фильтр общего списка. */
export type CommentListFilter = {
  readonly status: CommentStatus | 'all';
  readonly author: 'all' | 'user' | 'agent';
  readonly query: string;
};

type CommentsState = {
  readonly mapName: string | null;
  readonly threads: readonly CommentThread[];
  readonly loadError: string | null;
  readonly draft: CommentDraft | null;
  readonly saving: boolean;
  readonly saveError: string | null;
  readonly listOpen: boolean;
  readonly filter: CommentListFilter;
  /** Ветка, к которой перешли (подсветка в панели и метка на ноде). */
  readonly focusId: string | null;
  readonly setMapName: (name: string | null) => void;
  readonly refresh: () => Promise<void>;
  readonly startDraft: (draft: CommentDraft) => void;
  readonly setDraftShot: (shot: string | null) => void;
  readonly closeDraft: () => void;
  /** Сохранить черновик; true — сохранено. */
  readonly save: (text: string) => Promise<boolean>;
  readonly setStatus: (id: string, status: CommentStatus) => Promise<void>;
  readonly setListOpen: (open: boolean) => void;
  readonly setFilter: (patch: Partial<CommentListFilter>) => void;
  readonly focus: (id: string | null) => void;
};

const listSchema = z.object({ comments: z.array(commentThreadSchema) });
const oneSchema = z.object({ comment: commentThreadSchema });

function signature(threads: readonly CommentThread[]): string {
  return threads.map((t) => `${t.id}@${t.updatedAt}`).join('|');
}

/** Store замечаний. */
export const useCommentsStore = create<CommentsState>((set, get) => ({
  mapName: null,
  threads: [],
  loadError: null,
  draft: null,
  saving: false,
  saveError: null,
  listOpen: false,
  filter: { status: 'open', author: 'all', query: '' },
  focusId: null,
  setMapName: (mapName) => {
    if (mapName !== get().mapName) {
      set({ mapName, threads: [], focusId: null });
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
  startDraft: (draft) => set({ draft, saveError: null }),
  setDraftShot: (shot) => {
    const d = get().draft;
    if (d !== null) {
      set({ draft: { ...d, shot } });
    }
  },
  closeDraft: () => set({ draft: null, saveError: null }),
  save: async (text) => {
    const d = get().draft;
    if (d === null || d.shot === 'pending') {
      return false;
    }
    if (text.trim() === '') {
      set({ saveError: 'Напишите, что не так — или скажите голосом' });
      return false;
    }
    set({ saving: true, saveError: null });
    const r = await requestJson('/api/comments', {
      method: 'POST',
      json: { id: crypto.randomUUID(), text, anchor: d.anchor, shotDataUrl: d.shot },
    });
    if (!r.ok) {
      set({ saveError: r.error, saving: false });
      return false;
    }
    const parsed = oneSchema.safeParse(r.value);
    if (parsed.success) {
      set({ threads: [parsed.data.comment, ...get().threads.filter((t) => t.id !== parsed.data.comment.id)], focusId: parsed.data.comment.id });
    }
    set({ draft: null, saving: false });
    return true;
  },
  setStatus: async (id, status) => {
    const r = await requestJson(`/api/comments/${encodeURIComponent(id)}/events`, {
      method: 'POST',
      json: { type: 'status', status, note: null },
    });
    if (!r.ok && r.status === null) {
      throw new Error(r.error);
    }
    const parsed = oneSchema.safeParse(anyBody(r));
    if (parsed.success) {
      set({ threads: get().threads.map((t) => (t.id === id ? parsed.data.comment : t)) });
    }
  },
  setListOpen: (listOpen) => set({ listOpen }),
  setFilter: (patch) => set({ filter: { ...get().filter, ...patch } }),
  focus: (focusId) => set({ focusId }),
}));

/** Текст, по которому ищет общий список: замечание, экран, компонент, текст элемента. */
function searchText(t: CommentThread): string {
  const el = t.anchor.element;
  return [t.text, t.anchor.pageTitle, el?.component?.name ?? '', el?.text ?? ''].join(' ').toLowerCase();
}

/** Ветка подходит под статус и автора фильтра. */
function matchesKind(t: CommentThread, filter: CommentListFilter): boolean {
  return (filter.status === 'all' || t.status === filter.status) && (filter.author === 'all' || t.author === filter.author);
}

/**
 * Ветки по фильтру общего списка (свежие сверху — порядок сервера).
 *
 * @param threads - все ветки карты
 * @param filter - фильтр
 */
export function filterThreads(threads: readonly CommentThread[], filter: CommentListFilter): readonly CommentThread[] {
  const q = filter.query.trim().toLowerCase();
  return threads.filter((t) => matchesKind(t, filter) && (q === '' || searchText(t).includes(q)));
}
