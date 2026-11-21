/**
 * Модель вида «Документация»: список эпох, заметок и руководств, подписи файлов
 * эпохи, дата, готовность, пути картинок относительно документа.
 */
import { epochList, searchDocs, type DocHit } from '@live-app-map/graph';
import type { DocEpoch, DocFile, DocsModel, EpochReadiness } from '@live-app-map/schema';

/** Названия стандартных файлов эпохи (каркас docs-epoch). */
const FILE_LABELS: ReadonlyMap<string, string> = new Map([
  ['00-brief', 'Бриф'],
  ['01-interrogation', 'Вопросы'],
  ['02-research', 'Исследование'],
  ['03-impact', 'Влияние'],
  ['04-test-plan', 'План тестов'],
  ['05-plan', 'План'],
  ['06-decisions', 'Решения'],
  ['07-implementation-log', 'Журнал'],
  ['08-verify-report', 'Проверка'],
  ['09-bugs', 'Баги'],
  ['INDEX', 'Индекс'],
]);

/**
 * Подпись файла эпохи: стандартные — словом («Бриф», «Баги»), прочие — путём в эпохе без .md.
 *
 * @param epochDir - каталог эпохи
 * @param file - путь файла от корня
 * @returns подпись
 */
export function epochFileLabel(epochDir: string, file: string): string {
  const inside = file.startsWith(`${epochDir}/`) ? file.slice(epochDir.length + 1) : file;
  const base = inside.replace(/\.md$/i, '');
  return FILE_LABELS.get(base) ?? base;
}

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

/**
 * Дата эпохи: `21 ноя 2026, 20:56`.
 *
 * @param iso - `2026-11-21T20:56:36`
 * @returns строка или пусто
 */
export function epochDateLabel(iso: string | undefined): string {
  const m = iso === undefined ? null : /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  if (m === null) {
    return '';
  }
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] ?? ''} ${m[1]}, ${m[4]}:${m[5]}`;
}

/**
 * Готовность словами.
 *
 * @param e - эпоха
 * @returns подпись
 */
export function readinessLabel(e: Pick<DocEpoch, 'readiness' | 'openBugs'>): string {
  switch (e.readiness) {
    case 'ready':
      return 'готово';
    case 'not-ready':
      return `не готово · ${e.openBugs.length}`;
    case 'no-bugs-file':
      return 'нет 09-bugs';
  }
}

/** Секции левой колонки. */
export type DocsSections = {
  readonly epochs: readonly DocEpoch[];
  readonly notes: readonly DocFile[];
  readonly guides: readonly DocFile[];
  /** Совпадения в тексте (когда есть запрос). */
  readonly hits: readonly DocHit[];
};

/**
 * Левая колонка под запрос и готовность.
 *
 * @param docs - раздел docs
 * @param query - строка поиска
 * @param readiness - фильтр готовности эпох
 * @returns секции
 */
export function docsSections(docs: DocsModel, query: string, readiness: EpochReadiness | null): DocsSections {
  const q = query.trim().toLowerCase();
  const byTitle = (f: DocFile): boolean => q === '' || `${f.title}\n${f.path}`.toLowerCase().includes(q);
  return {
    epochs: epochList(docs, { query: q, ...(readiness === null ? {} : { readiness }) }),
    notes: docs.notes.filter(byTitle),
    guides: docs.guides.filter(byTitle),
    hits: q.length < 2 ? [] : searchDocs(docs, q, 30),
  };
}

/** Документ и эпоха, к которой он относится. */
export type OpenDoc = { readonly file: DocFile; readonly epoch?: DocEpoch };

/**
 * Документ по пути; по пути каталога эпохи — её первый файл (бриф).
 *
 * @param docs - раздел docs
 * @param docPath - путь файла или каталога эпохи
 * @returns документ или null
 */
export function openDocOf(docs: DocsModel, docPath: string | null): OpenDoc | null {
  if (docPath === null) {
    const e = docs.epochs[0];
    const f = e?.files[0];
    return f === undefined ? null : { file: f, ...(e === undefined ? {} : { epoch: e }) };
  }
  for (const e of docs.epochs) {
    if (e.dir === docPath && e.files[0] !== undefined) {
      return { file: e.files[0], epoch: e };
    }
    const f = e.files.find((x) => x.path === docPath);
    if (f !== undefined) {
      return { file: f, epoch: e };
    }
  }
  const other = [...docs.notes, ...docs.guides].find((f) => f.path === docPath);
  return other === undefined ? null : { file: other };
}

/**
 * Картинки эпохи для галереи под документом: все, кроме вставленных в текст как `![](…)`.
 *
 * @param images - картинки эпохи (пути от корня)
 * @param docPath - путь документа
 * @param text - markdown документа
 * @returns картинки галереи
 */
export function galleryImages(images: readonly string[], docPath: string, text: string): string[] {
  const embedded = new Set(
    [...text.matchAll(/!\[[^\]]*\]\(<?([^)\s>]+)/g)].flatMap((m) => {
      const p = m[1] === undefined ? null : resolveDocAsset(docPath, m[1]);
      return p === null ? [] : [p];
    }),
  );
  return images.filter((img) => !embedded.has(img));
}

/** Сегмент пути без %-кодов; битый код (`100%`) остаётся как есть. */
function safeDecode(seg: string): string {
  try {
    return decodeURIComponent(seg);
  } catch {
    return seg;
  }
}

/**
 * Путь картинки от корня по ссылке из markdown-документа.
 *
 * @param docPath - путь документа от корня
 * @param src - src из markdown
 * @returns путь от корня или null для внешних ссылок
 */
export function resolveDocAsset(docPath: string, src: string): string | null {
  if (/^[a-z]+:/i.test(src) || src.startsWith('//')) {
    return null;
  }
  const dir = docPath.split('/').slice(0, -1);
  const parts = src.startsWith('/') ? [] : [...dir];
  for (const seg of src.replace(/^\//, '').split(/[?#]/)[0]?.split('/') ?? []) {
    if (seg === '..') {
      parts.pop();
    } else if (seg !== '.' && seg !== '') {
      parts.push(safeDecode(seg));
    }
  }
  return parts.join('/');
}
