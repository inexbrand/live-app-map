/**
 * Адрес страницы ↔ навигация визуализатора: вид, выбранные роут, таблица,
 * документ, экран и режим документации живут в query, чтобы ссылкой можно было
 * поделиться, а «назад» и F5 не теряли место. Параметры карты (map, baseUrl, role)
 * не трогаются.
 */
import type { AppView } from '../store/view-store';

/** Режим вида «Документация»: текст документа или граф связей. */
export type DocsMode = 'text' | 'graph';

/** Где находится пользователь. */
export type NavState = {
  readonly view: AppView;
  readonly route: string | null;
  readonly table: string | null;
  readonly doc: string | null;
  readonly screen: string | null;
  readonly docsMode: DocsMode;
};

/** Начальное место: холст экранов, ничего не выбрано. */
export const NAV_HOME: NavState = {
  view: 'screens',
  route: null,
  table: null,
  doc: null,
  screen: null,
  docsMode: 'text',
};

const VIEWS: readonly AppView[] = ['screens', 'api', 'database', 'docs', 'compare'];

/** Ключи query, которыми владеет навигация. */
const KEYS = ['view', 'route', 'table', 'doc', 'screen', 'docs'];

function parseView(v: string | null): AppView {
  return VIEWS.find((x) => x === v) ?? 'screens';
}

function nonEmpty(v: string | null): string | null {
  return v === null || v.trim() === '' ? null : v;
}

/**
 * Место из query. Неизвестный вид — холст; пустые значения — не выбрано.
 *
 * @param search - строка query (`?view=api&route=…`) или URLSearchParams
 * @returns место
 */
export function navFromSearch(search: string | URLSearchParams): NavState {
  const q = typeof search === 'string' ? new URLSearchParams(search) : search;
  return {
    view: parseView(q.get('view')),
    route: nonEmpty(q.get('route')),
    table: nonEmpty(q.get('table')),
    doc: nonEmpty(q.get('doc')),
    screen: nonEmpty(q.get('screen')),
    docsMode: q.get('docs') === 'graph' ? 'graph' : 'text',
  };
}

/**
 * Query с местом: чужие параметры (map, baseUrl, role …) сохраняются, в адрес
 * попадает только то, что относится к открытому виду (плюс экран — он общий).
 *
 * @param nav - место
 * @param current - текущая строка query
 * @returns строка query с `?` или пустая
 */
export function searchWithNav(nav: NavState, current: string): string {
  const q = new URLSearchParams(current);
  KEYS.forEach((k) => q.delete(k));
  for (const [key, value] of navParams(nav)) {
    if (value !== null) {
      q.set(key, value);
    }
  }
  const s = q.toString();
  return s === '' ? '' : `?${s}`;
}

/** Параметры адреса вида: свой набор у каждого вида; null — не писать. */
function navParams(nav: NavState): [string, string | null][] {
  switch (nav.view) {
    case 'screens':
      return [['screen', nav.screen]];
    case 'api':
      return [['view', nav.view], ['route', nav.route]];
    case 'database':
      return [['view', nav.view], ['table', nav.table]];
    case 'docs':
      return [['view', nav.view], ['doc', nav.doc], ['docs', nav.docsMode === 'graph' ? 'graph' : null]];
    default:
      return [['view', nav.view]];
  }
}