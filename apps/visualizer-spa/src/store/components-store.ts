/**
 * Вид «Компоненты»: галерея вариантов из states.ts проекта и видимые узлы.
 */
import { create } from 'zustand';
import { buildGallery, type Gallery, type GalleryApp } from '../lib/components-gallery/gallery';

/** Состояние загрузки галереи. */
export type GalleryStatus = 'idle' | 'loading' | 'ready' | 'error';

type ComponentsState = {
  readonly status: GalleryStatus;
  /** Текст ошибки загрузки с подсказкой. */
  readonly error: string | null;
  readonly gallery: Gallery;
  /** Узлы, попавшие в окно холста. */
  readonly visible: ReadonlySet<string>;
  /** Загрузить галерею: states.ts и приложения проекта. */
  readonly load: (fetchJson: (url: string) => Promise<unknown>) => Promise<void>;
  readonly setVisible: (id: string, on: boolean) => void;
};

const EMPTY: Gallery = { groups: [], problems: [] };

/** Адрес состояний проекта на dev-сервере визуализатора: { screens, components }. */
export const PROJECT_STATES_URL = '/__lam_project/states';

/** Адрес config.ts проекта: LamProjectConfig как есть. */
export const PROJECT_CONFIG_URL = '/__lam_project/config';

/** Приложения из config.ts: [{id,label,dir,baseUrl}]; иначе ошибка с подсказкой. */
export function appsOf(config: unknown): GalleryApp[] {
  const raw = typeof config === 'object' && config !== null ? Reflect.get(config, 'apps') : undefined;
  if (!Array.isArray(raw)) {
    throw new Error('в ответе ' + PROJECT_CONFIG_URL + ' нет apps — приложения из .live-app-map/config.ts');
  }
  return raw.map((a: unknown, i) => {
    const get = (k: string): string => {
      const v = typeof a === 'object' && a !== null ? Reflect.get(a, k) : undefined;
      if (typeof v !== 'string' || v === '') {
        throw new Error('apps[' + i + '].' + k + ' пусто — заполните приложение в .live-app-map/config.ts');
      }
      return v;
    };
    return { id: get('id'), label: get('label'), dir: get('dir'), baseUrl: get('baseUrl') };
  });
}

/** Store вида «Компоненты». */
export const useComponentsStore = create<ComponentsState>((set, get) => ({
  status: 'idle',
  error: null,
  gallery: EMPTY,
  visible: new Set<string>(),
  load: async (fetchJson) => {
    if (get().status === 'loading') {
      return;
    }
    set({ status: 'loading', error: null });
    try {
      const [states, config] = await Promise.all([fetchJson(PROJECT_STATES_URL), fetchJson(PROJECT_CONFIG_URL)]);
      const components = typeof states === 'object' && states !== null ? Reflect.get(states, 'components') : undefined;
      set({ status: 'ready', gallery: buildGallery(components ?? {}, appsOf(config)) });
    } catch (e) {
      set({ status: 'error', error: e instanceof Error ? e.message : String(e), gallery: EMPTY });
    }
  },
  setVisible: (id, on) => {
    const cur = get().visible;
    if (cur.has(id) === on) {
      return;
    }
    const next = new Set(cur);
    if (on) {
      next.add(id);
    } else {
      next.delete(id);
    }
    set({ visible: next });
  },
}));
