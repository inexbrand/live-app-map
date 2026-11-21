/**
 * Скан документации: временный проект с эпохами разных форматов 09-bugs
 * и живые репозитории (korbor, vpn-saas, сам live-app-map), если они рядом.
 */
import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { scanDocs } from './index';

function put(root: string, file: string, text: string): void {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), text);
}

function project(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'lam-docs-'));
  const a = 'docs/epoch/api-views#20261121-205636';
  put(root, `${a}/00-brief.md`, '# Brief\n\n## Цель\n\nПоказать **архитектуру** API\nи документацию.\n\n## Готово когда\n\n- [ ] вид');
  put(root, `${a}/09-bugs.md`, '# Баги\n\n## Open\n\n- Картинка не грузится\n  подробности\n- [x] уже исправлено\n\n## Closed\n\n- старое');
  put(root, `${a}/INDEX.md`, '# Epoch index\n\n- Status: verify (живой прогон)\n');
  put(root, `${a}/screens/api.png`, 'png');
  put(root, `${a}/proofs/log.md`, '# Лог');
  const b = 'docs/epoch/done-task#20260101-090000';
  put(root, `${b}/09-bugs.md`, '# Баги\n\n## Open\n\n(пусто)\n\n## Closed\n\n- было');
  const c = 'docs/epoch/checkbox#20260505-101010';
  put(root, `${c}/09-bugs.md`, '# Открытые вопросы\n\n- [ ] вне рамок: лимитер\n- [x] закрыто\n\n```\n- [ ] в коде не считается\n```');
  put(root, 'docs/epoch/no-date/00-brief.md', '# Brief\n\n## Цель\n\n(заполнить после допроса)');
  put(root, 'docs/agent-notes/db.md', '# Запросы к БД\n\nбез N+1');
  put(root, 'CLAUDE.md', '# Правила');
  symlinkSync('CLAUDE.md', path.join(root, 'AGENTS.md'));
  put(root, 'README.md', 'без заголовка');
  put(root, 'docs/design.md', '# Дизайн');
  return root;
}

describe('scanDocs', () => {
  test('эпохи: дата из имени, новые первыми, цель, статус, готовность по 09-bugs', () => {
    const docs = scanDocs(project());
    expect(docs.epochs.map((e) => e.id)).toEqual([
      'api-views#20261121-205636',
      'checkbox#20260505-101010',
      'done-task#20260101-090000',
      'no-date',
    ]);
    const [api, checkbox, done, noDate] = docs.epochs;
    expect(api?.slug).toBe('api-views');
    expect(api?.date).toBe('2026-11-21T20:56:36');
    expect(api?.summary).toBe('Показать архитектуру API и документацию.');
    expect(api?.declaredStatus).toBe('verify (живой прогон)');
    expect(api?.readiness).toBe('not-ready');
    expect(api?.openBugs).toEqual(['Картинка не грузится']);
    expect(api?.images).toEqual(['docs/epoch/api-views#20261121-205636/screens/api.png']);
    expect(api?.files.map((f) => f.path.split('/').slice(3).join('/'))).toEqual([
      '00-brief.md',
      '09-bugs.md',
      'INDEX.md',
      'proofs/log.md',
    ]);
    expect(checkbox?.openBugs).toEqual(['вне рамок: лимитер']);
    expect(done?.readiness).toBe('ready');
    expect(noDate?.date).toBeUndefined();
    expect(noDate?.summary).toBeUndefined();
    expect(noDate?.readiness).toBe('no-bugs-file');
  });

  test('заметки и руководства: ссылка AGENTS.md → CLAUDE.md не дублируется, заголовок или имя файла', () => {
    const docs = scanDocs(project());
    expect(docs.notes.map((n) => [n.path, n.title])).toEqual([['docs/agent-notes/db.md', 'Запросы к БД']]);
    expect(docs.guides.map((g) => [g.path, g.title])).toEqual([
      ['CLAUDE.md', 'Правила'],
      ['README.md', 'README'],
      ['docs/design.md', 'Дизайн'],
    ]);
  });

  test('проект без docs — пустые списки', () => {
    const docs = scanDocs(mkdtempSync(path.join(tmpdir(), 'lam-empty-')));
    expect(docs.epochs).toEqual([]);
    expect(docs.notes).toEqual([]);
  });

  const live = [
    path.resolve(import.meta.dir, '../../..'),
    path.resolve(import.meta.dir, '../../../../../../korbor'),
    path.resolve(import.meta.dir, '../../../../../../vpn-saas'),
  ].filter((r) => existsSync(path.join(r, 'docs', 'epoch')));

  for (const root of live) {
    test(`живой репозиторий ${path.basename(root)}: каждая папка docs/epoch — эпоха с файлами`, () => {
      const dirs = readdirSync(path.join(root, 'docs', 'epoch'), { withFileTypes: true }).filter(
        (e) => e.isDirectory() && !e.name.startsWith('.'),
      );
      const docs = scanDocs(root);
      expect(docs.epochs.length).toBe(dirs.length);
      expect(docs.epochs.every((e) => e.files.length > 0 || e.images.length > 0)).toBe(true);
      expect(docs.guides.length).toBeGreaterThan(0);
    });
  }
});
