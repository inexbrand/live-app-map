/**
 * Галерея компонентов: варианты из states.ts (components) → узлы по приложениям
 * и папкам; экран узла — страница компонента плагина SDK (/@lam/component).
 */

/** Приложение проекта из config.ts (что нужно галерее). */
export type GalleryApp = {
  readonly id: string;
  readonly label: string;
  /** Каталог от корня проекта: apps/miniapp. */
  readonly dir: string;
  /** Адрес dev-сервера приложения. */
  readonly baseUrl: string;
};

/** Узел галереи — один вариант компонента. */
export type GalleryItem = {
  /** Ключ экрана трансляции и id узла: component:<ключ>/<вариант>. */
  readonly id: string;
  /** Ключ компонента: <файл от корня проекта>#<экспорт>. */
  readonly key: string;
  readonly exportName: string;
  readonly file: string;
  readonly appId: string;
  readonly variantId: string;
  readonly label: string;
  /** Страница компонента на dev-сервере приложения. */
  readonly url: string;
};

/** Группа: приложение и папка компонента от каталога приложения. */
export type GalleryGroup = {
  readonly appId: string;
  readonly appLabel: string;
  /** Папка от каталога приложения: src/shared/ui. */
  readonly folder: string;
  readonly items: readonly GalleryItem[];
};

/** Галерея и то, что не удалось показать (с причиной). */
export type Gallery = { readonly groups: readonly GalleryGroup[]; readonly problems: readonly string[] };

/**
 * Адрес страницы компонента плагина SDK.
 *
 * @param baseUrl - адрес dev-сервера приложения
 * @param key - ключ компонента
 * @param variant - id варианта
 */
export function componentPageUrl(baseUrl: string, key: string, variant: string): string {
  return baseUrl.replace(/\/+$/, '') + '/@lam/component?key=' + encodeURIComponent(key) + '&variant=' + encodeURIComponent(variant);
}

/** Приложение, внутри каталога которого лежит файл (самый длинный каталог). */
function appOfFile(file: string, apps: readonly GalleryApp[]): GalleryApp | null {
  let best: GalleryApp | null = null;
  for (const app of apps) {
    const dir = app.dir.replace(/\/+$/, '') + '/';
    if (file.startsWith(dir) && (best === null || dir.length > best.dir.length + 1)) {
      best = app;
    }
  }
  return best;
}

/** Вариант из JSON: id и label строками. */
function variantOf(raw: unknown): { readonly id: string; readonly label: string } | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const id = Reflect.get(raw, 'id');
  const label = Reflect.get(raw, 'label');
  return typeof id === 'string' && id !== '' && typeof label === 'string' && label !== '' ? { id, label } : null;
}

/**
 * Галерея из components states.ts: группы по порядку приложений config.ts,
 * внутри — по папке (по алфавиту), варианты — в порядке файла.
 *
 * @param components - экспорт components (JSON из /__lam_project/states)
 * @param apps - приложения проекта
 */
export function buildGallery(components: unknown, apps: readonly GalleryApp[]): Gallery {
  if (typeof components !== 'object' || components === null || Array.isArray(components)) {
    return { groups: [], problems: ['components в states.ts — объект «ключ → варианты»'] };
  }
  const problems: string[] = [];
  const byGroup = new Map<string, { app: GalleryApp; folder: string; items: GalleryItem[] }>();
  for (const [key, list] of Object.entries(components)) {
    const hash = key.lastIndexOf('#');
    if (hash <= 0 || hash === key.length - 1) {
      problems.push(key + ': ключ — «<файл от корня проекта>#<экспорт>»');
      continue;
    }
    const file = key.slice(0, hash);
    const app = appOfFile(file, apps);
    if (app === null) {
      problems.push(key + ': файл не внутри приложений config.ts (' + apps.map((a) => a.dir).join(', ') + ')');
      continue;
    }
    const inApp = file.slice(app.dir.replace(/\/+$/, '').length + 1);
    const folder = inApp.includes('/') ? inApp.slice(0, inApp.lastIndexOf('/')) : '.';
    const gk = app.id + '\u0000' + folder;
    const group = byGroup.get(gk) ?? { app, folder, items: [] };
    for (const raw of Array.isArray(list) ? list : []) {
      const v = variantOf(raw);
      if (v === null) {
        problems.push(key + ': вариант без id или label');
        continue;
      }
      group.items.push({ id: 'component:' + key + '/' + v.id, key, exportName: key.slice(hash + 1), file, appId: app.id, variantId: v.id, label: v.label, url: componentPageUrl(app.baseUrl, key, v.id) });
    }
    if (group.items.length > 0) {
      byGroup.set(gk, group);
    }
  }
  const order = new Map(apps.map((a, i) => [a.id, i]));
  const groups = [...byGroup.values()]
    .sort((a, b) => (order.get(a.app.id) ?? 0) - (order.get(b.app.id) ?? 0) || a.folder.localeCompare(b.folder))
    .map((g) => ({ appId: g.app.id, appLabel: g.app.label, folder: g.folder, items: g.items }));
  return { groups, problems };
}
