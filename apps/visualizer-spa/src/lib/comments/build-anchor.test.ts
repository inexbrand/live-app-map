/**
 * Привязка замечания: исходник компонента, перевод рамки, текст для агента.
 */
import { describe, expect, test } from 'bun:test';
import type { CodeModel, CodeSymbol } from '@live-app-map/schema';
import type { LamPickedMessage } from '../gateway/pick-script';
import { buildAnchor, frameToView, padRect, repoPath, resolveComponentSource } from './build-anchor';
import { commentPrompt } from './comment-prompt';

function symbol(name: string, file: string, line: number): CodeSymbol {
  return { id: `${file}#${name}`, kind: 'component', name, serviceId: 'miniapp', location: { file, line } };
}

const code: CodeModel = {
  root: '/repo',
  services: [],
  symbols: [symbol('VacancyCard', 'apps/miniapp/src/features/vacancies/VacancyCard.tsx', 8), symbol('FeedPage', 'apps/miniapp/src/pages/feed.tsx', 3)],
  routes: [],
  tables: [],
};

const picked: LamPickedMessage = {
  lam: 'picked',
  selector: 'button.apply:nth-of-type(1)',
  domPath: 'body > div#root > button.apply',
  tag: 'button',
  text: 'Откликнуться',
  rect: { x: 16, y: 900, width: 200, height: 44 },
  client: { x: 16, y: 400, width: 200, height: 44 },
  viewport: { width: 390, height: 844 },
  component: { name: 'Button', chain: ['Button', 'VacancyCard', 'FeedPage'], stack: { file: 'src/features/vacancies/VacancyCard.tsx', line: 45 } },
};

describe('привязка замечания', () => {
  test('исходник: место JSX из стека приводится к пути карты кода', () => {
    expect(resolveComponentSource(picked.component ?? { name: '', chain: [], stack: null }, code)).toEqual({
      file: 'apps/miniapp/src/features/vacancies/VacancyCard.tsx',
      line: 45,
      origin: 'react-stack',
    });
  });

  test('путь из стека без карты кода приводится к корню репозитория по файлу экрана', () => {
    expect(repoPath('src/features/x.tsx', 'apps/miniapp/src/app/routes-config.tsx')).toBe('apps/miniapp/src/features/x.tsx');
    expect(repoPath('src/features/x.tsx', 'src/app/routes.tsx')).toBe('src/features/x.tsx');
    expect(repoPath('src/features/x.tsx', undefined)).toBe('src/features/x.tsx');
    expect(resolveComponentSource({ name: 'Card', chain: ['Card'], stack: { file: 'src/a.tsx', line: 3 } }, undefined, 'apps/admin/src/routes.tsx')).toEqual({ file: 'apps/admin/src/a.tsx', line: 3, origin: 'react-stack' });
  });

  test('без стека — определение ближайшего компонента цепочки из карты', () => {
    expect(resolveComponentSource({ name: 'Button', chain: ['Button', 'FeedPage'], stack: null }, code)).toEqual({ file: 'apps/miniapp/src/pages/feed.tsx', line: 3, origin: 'code-map' });
    expect(resolveComponentSource({ name: 'X', chain: ['X'], stack: null }, undefined)).toBeNull();
  });

  test('привязка и текст для агента содержат экран, компонент, файл:строку и id для ответа', () => {
    const anchor = buildAnchor({ picked, page: { id: 'feed', title: 'Лента', url: 'https://x/#/feed' }, mapName: 'korbor', role: 'recruiter', code });
    expect(anchor.element?.component?.source?.line).toBe(45);
    const md = commentPrompt({
      id: 'c1', author: 'user', text: 'Кнопка обрезана', anchor, shot: null, status: 'open', createdAt: '', updatedAt: '',
      events: [],
    });
    expect(md).toContain('Компонент: Button — apps/miniapp/src/features/vacancies/VacancyCard.tsx:45');
    expect(md).toContain('Над ним: VacancyCard › FeedPage');
    expect(md).toContain('commentId «c1»');
  });

  test('рамка страницы → окно визуализатора с учётом масштаба iframe; поля обрезаются окном', () => {
    expect(frameToView({ left: 100, top: 50, width: 195 }, 390, picked.client)).toEqual({ x: 108, y: 250, width: 100, height: 22 });
    expect(padRect({ x: 2, y: 10, width: 50, height: 20 }, 8, { width: 56, height: 100 })).toEqual({ x: 0, y: 2, width: 56, height: 36 });
  });
});
