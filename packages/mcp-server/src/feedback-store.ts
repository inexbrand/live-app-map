/**
 * Feedback v1 на диске: `<lamDir>/<stamp>-<pageId>.json|.md`.
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** Пути сохранённого feedback. */
export type SavedFeedback = {
  readonly jsonPath: string;
  readonly mdPath: string | null;
};

function pageIdOf(feedback: object): string {
  const page = 'page' in feedback ? feedback.page : undefined;
  if (typeof page === 'object' && page !== null && 'id' in page) {
    return String(page.id);
  }
  return 'feedback';
}

/**
 * Сохраняет feedback JSON и, если есть, промпт markdown.
 *
 * @param lamDir - папка обмена
 * @param feedback - объект live-app-map-feedback v1
 * @param now - время (для тестов)
 */
export function saveFeedback(
  lamDir: string,
  feedback: object,
  now: Date = new Date(),
): SavedFeedback {
  mkdirSync(lamDir, { recursive: true });
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const safe = pageIdOf(feedback).replace(/[^a-zA-Z0-9_-]+/g, '_');
  const jsonPath = path.join(lamDir, `${stamp}-${safe}.json`);
  writeFileSync(jsonPath, `${JSON.stringify(feedback, null, 2)}\n`, 'utf8');
  const prompt = 'promptMarkdown' in feedback ? feedback.promptMarkdown : undefined;
  if (typeof prompt !== 'string') {
    return { jsonPath, mdPath: null };
  }
  const mdPath = path.join(lamDir, `${stamp}-${safe}.md`);
  writeFileSync(mdPath, prompt.endsWith('\n') ? prompt : `${prompt}\n`, 'utf8');
  return { jsonPath, mdPath };
}

/**
 * Список сохранённых feedback JSON.
 *
 * @param lamDir - папка обмена
 */
export function listFeedback(lamDir: string): readonly string[] {
  if (!existsSync(lamDir)) {
    return [];
  }
  return readdirSync(lamDir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => path.join(lamDir, f));
}
