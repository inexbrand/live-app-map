/**
 * Контракт проекта Live App Map: что лежит в `<проект>/.live-app-map/`.
 *
 * Папка в проекте приложения (а не в репозитории Live App Map):
 * - `config.ts`  — `export const config: LamProjectConfig` (в git);
 * - `states.ts`  — `export const screens: LamScreenStates` и
 *   `export const components: LamComponentFixtures` — пишет агент по скиллу (в git);
 * - `map.json`   — результат скана, в .gitignore.
 * Типы импортируются только как `import type` — в рантайм приложения ничего не попадает.
 */

/** Приложение проекта: один фронтенд. */
export type LamApp = {
  /** id группы на карте и префикс id экранов: miniapp → `miniapp:route:/feed`. */
  readonly id: string;
  /** Подпись группы: «Мини-приложение». */
  readonly label: string;
  /** Каталог приложения от корня проекта: apps/miniapp. */
  readonly dir: string;
  /** Адрес dev-сервера: https://vite.localhost:5175. */
  readonly baseUrl: string;
  /** Роли входа (id ролей протокола dev-входа), под которыми показывать экраны. */
  readonly roles?: readonly string[];
};

/** Проект: приложения и бэкенд. */
export type LamProjectConfig = {
  /** Имя проекта: korbor. */
  readonly name: string;
  readonly apps: readonly LamApp[];
  /** Каталоги бэкенда для скана API и БД: ['apps/api', 'packages/db']. */
  readonly backend?: readonly string[];
  /** Связи экранов, которых нет в коде (табы, перекрёстные ссылки приложений). */
  readonly links?: readonly LamLink[];
};

/** Связь экранов: `<id приложения>:<путь маршрута>` → то же; `miniapp:/feed` → `miniapp:/applications`. */
export type LamLink = {
  readonly from: string;
  readonly to: string;
  /** Подпись ребра: «Таб». */
  readonly label?: string;
};

/** Подмена ответа API в состоянии экрана; 'pending' — ответ не приходит никогда (загрузка). */
export type LamApiOverride = { readonly status: number; readonly body?: unknown; readonly delayMs?: number } | 'pending';

/** Шаг до снимка состояния: выполняет браузер трансляции после загрузки страницы. */
export type LamStep =
  | { readonly click: string }
  | { readonly fill: string; readonly value: string }
  | { readonly press: string }
  | { readonly waitFor: string }
  | { readonly scroll: number };

/**
 * Состояние экрана. Селекторы шагов — Playwright (`text=Фильтры`, `role=button[name="Создать"]`, css).
 * Ключ api — «МЕТОД /путь» с :параметрами: `GET /api/v1/recruiter/feed`.
 */
export type LamScreenState = {
  /** id: строчные латинские, цифры, дефис: empty, error, filters-open. */
  readonly id: string;
  /** Подпись: «Пустая лента». */
  readonly label: string;
  /** Роль входа; нет — первая роль приложения. */
  readonly role?: string;
  /** Вид состояния — для группировки на карте. */
  readonly kind: 'data' | 'empty' | 'error' | 'loading' | 'ui';
  readonly api?: Readonly<Record<string, LamApiOverride>>;
  readonly steps?: readonly LamStep[];
  /** Зачем это состояние, что на нём видно. */
  readonly note?: string;
};

/** id экрана карты (`miniapp:route:/feed`) → его состояния. */
export type LamScreenStates = Readonly<Record<string, readonly LamScreenState[]>>;

/** Вариант компонента в галерее: пропсы и, если нужно, подмена API. */
export type LamComponentFixture = {
  readonly id: string;
  readonly label: string;
  readonly props?: Readonly<Record<string, unknown>>;
  readonly api?: Readonly<Record<string, LamApiOverride>>;
};

/**
 * Компонент → варианты. Ключ — `<файл от корня проекта>#<экспорт>`:
 * `apps/miniapp/src/shared/ui/Button.tsx#Button`.
 */
export type LamComponentFixtures = Readonly<Record<string, readonly LamComponentFixture[]>>;

/** Параметр адреса, которым визуализатор просит у рантайма состояние экрана или варианта. */
export const LAM_STATE_PARAM = 'lam_state';
