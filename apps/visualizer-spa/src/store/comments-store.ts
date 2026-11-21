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
const errorSchema = z.object({ error: z.string() });

function signature(threads: readonly CommentThread[]): string {
  return threads.map((t) => `${t.id}@${t.updatedAt}`).join('|');
}

async function errorText(res: Response): Promise<string> {
  const parsed = errorSchema.safeParse(await res.json().catch(() => null));
  return parsed.success ? parsed.data.error : `HTTP ${res.status}`;
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
    try {
      const res = await fetch(`/api/comments?mapName=${encodeURIComponent(mapName)}`);
      const parsed = listSchema.safeParse(await res.json());
      if (!parsed.success) {
        set({ loadError: 'ответ /api/comments не по схеме' });
        return;
      }
      if (get().mapName === mapName && signature(parsed.data.comments) !== signature(get().threads)) {
        set({ threads: parsed.data.comments, loadError: null });
      }
    } catch (err) {
      set({ loadError: err instanceof Error ? err.message : String(err) });
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
    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: crypto.randomUUID(), text, anchor: d.anchor, shotDataUrl: d.shot }),
      });
      if (!res.ok) {
        set({ saveError: await errorText(res) });
        return false;
      }
      const parsed = oneSchema.safeParse(await res.json());
      if (parsed.success) {
        set({ threads: [parsed.data.comment, ...get().threads.filter((t) => t.id !== parsed.data.comment.id)], focusId: parsed.data.comment.id });
      }
      set({ draft: null });
      return true;
    } catch (err) {
      set({ saveError: err instanceof Error ? err.message : String(err) });
      return false;
    } finally {
      set({ saving: false });
    }
  },
  setStatus: async (id, status) => {
    const res = await fetch(`/api/comments/${encodeURIComponent(id)}/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'status', status, note: null }),
    });
    const parsed = oneSchema.safeParse(await res.json());
    if (parsed.success) {
      set({ threads: get().threads.map((t) => (t.id === id ? parsed.data.comment : t)) });
    }
  },
  setListOpen: (listOpen) => set({ listOpen }),
  setFilter: (patch) => set({ filter: { ...get().filter, ...patch } }),
  focus: (focusId) => set({ focusId }),
}));

/**
 * Ветки по фильтру общего списка (свежие сверху — порядок сервера).
 *
 * @param threads - все ветки карты
 * @param filter - фильтр
 */
export function filterThreads(threads: readonly CommentThread[], filter: CommentListFilter): readonly CommentThread[] {
  const q = filter.query.trim().toLowerCase();
  return threads.filter((t) => {
    if (filter.status !== 'all' && t.status !== filter.status) {
      return false;
    }
    if (filter.author !== 'all' && t.author !== filter.author) {
      return false;
    }
    if (q === '') {
      return true;
    }
    const hay = [t.text, t.anchor.pageTitle, t.anchor.element?.component?.name ?? '', t.anchor.element?.text ?? ''].join(' ').toLowerCase();
    return hay.includes(q);
  });
}
