/**
 * Скан документации проекта: эпохи `docs/epoch/<slug>#<дата>/`, заметки
 * `docs/agent-notes`, руководства (CLAUDE.md, AGENTS.md, README.md, `docs/*.md`).
 */
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import type { DocEpoch, DocFile, DocsModel, EpochReadiness } from '@live-app-map/schema';
import { briefSummary, declaredStatus, firstHeading, openBugItems } from './markdown-text';

/** Предел текста одного файла: больше — обрезается с пометкой. */
const TEXT_MAX = 200_000;
const IMAGE = /\.(png|jpe?g|webp|gif|svg)$/i;
const MARKDOWN = /\.md$/i;
/** Имя папки эпохи: `slug#YYYYMMDD-HHMMSS`. */
const EPOCH_NAME = /^(.+)#(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/;
const ROOT_GUIDES = ['CLAUDE.md', 'AGENTS.md', 'README.md'];

/** POSIX-путь от корня. */
function rel(root: string, abs: string): string {
  return path.relative(root, abs).split(path.sep).join('/');
}

/** Файлы каталога рекурсивно, по имени; скрытые и node_modules пропускаются. */
function listFiles(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }
  const out: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  // Сначала файлы самой папки, потом вложенные.
  for (const e of entries) {
    if (e.isFile()) {
      out.push(path.join(dir, e.name));
    }
  }
  for (const e of entries) {
    if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules') {
      out.push(...listFiles(path.join(dir, e.name)));
    }
  }
  return out;
}

/** Документ: заголовок и текст (с пределом). */
function readDoc(root: string, abs: string): DocFile {
  const raw = readFileSync(abs, 'utf8');
  const text = raw.length > TEXT_MAX ? `${raw.slice(0, TEXT_MAX)}\n\n…(файл обрезан сканером: ${raw.length} символов)` : raw;
  return { path: rel(root, abs), title: firstHeading(text) ?? path.basename(abs, path.extname(abs)), text };
}

/** Дата из имени папки в ISO без зоны. */
function epochDate(m: RegExpExecArray): string {
  return `${m[2]}-${m[3]}-${m[4]}T${m[5]}:${m[6]}:${m[7]}`;
}

/** Готовность эпохи: нет файла багов (или пуст), есть открытые, всё закрыто. */
function readinessOf(bugs: DocFile | undefined, openCount: number): EpochReadiness {
  if (bugs === undefined || bugs.text.trim() === '') {
    return 'no-bugs-file';
  }
  return openCount > 0 ? 'not-ready' : 'ready';
}

/** Значение из текста документа, если документ есть. */
function mapDoc<T>(doc: DocFile | undefined, read: (text: string) => T | undefined): T | undefined {
  return doc === undefined ? undefined : read(doc.text);
}

/**
 * Эпоха из папки (после правки её файлов — заново, без скана всего проекта).
 *
 * @param root - корень проекта
 * @param dir - абсолютный путь папки эпохи
 * @returns эпоха
 */
export function readEpoch(root: string, dir: string): DocEpoch {
  const name = path.basename(dir);
  const m = EPOCH_NAME.exec(name);
  const all = listFiles(dir);
  const files = all.filter((f) => MARKDOWN.test(f)).map((f) => readDoc(root, f));
  const top = (file: string): DocFile | undefined => files.find((f) => f.path === rel(root, path.join(dir, file)));
  const bugs = top('09-bugs.md');
  const openBugs = bugs === undefined ? [] : openBugItems(bugs.text);
  const readiness = readinessOf(bugs, openBugs.length);
  const summary = mapDoc(top('00-brief.md'), briefSummary);
  const status = mapDoc(top('INDEX.md'), declaredStatus);
  return {
    id: name,
    slug: m?.[1] ?? name,
    ...(m === null ? {} : { date: epochDate(m) }),
    dir: rel(root, dir),
    ...(summary === undefined ? {} : { summary }),
    ...(status === undefined ? {} : { declaredStatus: status }),
    readiness,
    openBugs,
    files,
    images: all.filter((f) => IMAGE.test(f)).map((f) => rel(root, f)),
  };
}

/** Новые эпохи первыми; без даты — в конце по имени. */
function byDateDesc(a: DocEpoch, b: DocEpoch): number {
  if (a.date !== undefined && b.date !== undefined) {
    return a.date === b.date ? a.id.localeCompare(b.id) : a.date < b.date ? 1 : -1;
  }
  if (a.date !== b.date) {
    return a.date === undefined ? 1 : -1;
  }
  return a.id.localeCompare(b.id);
}

/** Руководства: CLAUDE.md, AGENTS.md (если не ссылка на CLAUDE.md), README.md, `docs/*.md`. */
function readGuides(root: string): DocFile[] {
  const seen = new Set<string>();
  const out: DocFile[] = [];
  const add = (abs: string): void => {
    if (!existsSync(abs) || !statSync(abs).isFile()) {
      return;
    }
    const real = realpathSync(abs);
    if (!seen.has(real)) {
      seen.add(real);
      out.push(readDoc(root, abs));
    }
  };
  ROOT_GUIDES.forEach((f) => add(path.join(root, f)));
  const docsDir = path.join(root, 'docs');
  if (existsSync(docsDir)) {
    readdirSync(docsDir, { withFileTypes: true })
      .filter((e) => e.isFile() && MARKDOWN.test(e.name))
      .map((e) => e.name)
      .sort()
      .forEach((f) => add(path.join(docsDir, f)));
  }
  return out;
}

/**
 * Сканирует документацию проекта.
 *
 * @param projectRoot - корень проекта (тот же, что `--code-dir`)
 * @returns раздел docs карты; пустые списки, если документации нет
 */
export function scanDocs(projectRoot: string): DocsModel {
  const root = path.resolve(projectRoot);
  const epochRoot = path.join(root, 'docs', 'epoch');
  const epochDirs = existsSync(epochRoot)
    ? readdirSync(epochRoot, { withFileTypes: true })
        .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
        .map((e) => path.join(epochRoot, e.name))
    : [];
  return {
    root,
    epochs: epochDirs.map((d) => readEpoch(root, d)).sort(byDateDesc),
    notes: listFiles(path.join(root, 'docs', 'agent-notes'))
      .filter((f) => MARKDOWN.test(f))
      .map((f) => readDoc(root, f)),
    guides: readGuides(root),
  };
}
