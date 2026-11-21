/**
 * Раздел `docs` карты: документация проекта — эпохи задач
 * (`docs/epoch/<задача>#<дата>/`), заметки агентов (`docs/agent-notes`)
 * и руководства (CLAUDE.md, AGENTS.md, README.md, `docs/*.md`).
 *
 * Пути — от `DocsModel.root`, в POSIX-виде.
 */

/** Markdown-документ. */
export type DocFile = {
  /** Путь от корня проекта: `docs/epoch/x#20261121-205636/00-brief.md`. */
  readonly path: string;
  /** Первый заголовок `# …` или имя файла. */
  readonly title: string;
  /** Текст markdown целиком. */
  readonly text: string;
};

/**
 * Готовность эпохи по 09-bugs: `ready` — открытых пунктов нет,
 * `not-ready` — есть открытые, `no-bugs-file` — файла 09-bugs нет или он пуст.
 */
export type EpochReadiness = 'ready' | 'not-ready' | 'no-bugs-file';

/** Эпоха задачи: папка `docs/epoch/<slug>#<дата>/`. */
export type DocEpoch = {
  /** Имя папки: `api-docs-views#20261121-205636`. */
  readonly id: string;
  readonly slug: string;
  /** Дата и время из имени папки, ISO без зоны: `2026-11-21T20:56:36`; нет — имя без даты. */
  readonly date?: string;
  /** Каталог эпохи от корня. */
  readonly dir: string;
  /** Цель задачи одной строкой из 00-brief. */
  readonly summary?: string;
  /** Статус из INDEX.md (`research`, `verified`, `done` …), как записан. */
  readonly declaredStatus?: string;
  readonly readiness: EpochReadiness;
  /** Открытые пункты 09-bugs одной строкой каждый. */
  readonly openBugs: readonly string[];
  /** Markdown-файлы эпохи по имени (00-brief … 09-bugs, INDEX, прочие, вложенные). */
  readonly files: readonly DocFile[];
  /** Картинки эпохи (screens/, proofs/ …) — пути от корня. */
  readonly images: readonly string[];
};

/** Раздел `docs` документа карты. */
export type DocsModel = {
  /** Каталог проекта; от него считаются пути. */
  readonly root: string;
  /** Эпохи, новые первыми. */
  readonly epochs: readonly DocEpoch[];
  /** Заметки агентов `docs/agent-notes/*.md`. */
  readonly notes: readonly DocFile[];
  /** Руководства: CLAUDE.md, AGENTS.md, README.md в корне и `docs/*.md`. */
  readonly guides: readonly DocFile[];
};
