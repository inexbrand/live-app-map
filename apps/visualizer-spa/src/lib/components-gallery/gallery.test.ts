import { describe, expect, test } from 'bun:test';
import { buildGallery, componentPageUrl, type GalleryApp } from './gallery';

const apps: readonly GalleryApp[] = [
  { id: 'miniapp', label: 'Мини-приложение', dir: 'apps/miniapp', baseUrl: 'https://vite.localhost:5175/' },
  { id: 'admin', label: 'Админка', dir: 'apps/admin', baseUrl: 'http://localhost:16002' },
];

describe('галерея компонентов', () => {
  test('узел на вариант, группы по приложению и папке, адрес страницы компонента', () => {
    const g = buildGallery(
      {
        'apps/miniapp/src/shared/ui/Button.tsx#Button': [
          { id: 'primary', label: 'Основная', props: { label: 'Да' } },
          { id: 'ghost', label: 'Тихая' },
        ],
        'apps/miniapp/src/features/feed/Card.tsx#Card': [{ id: 'empty', label: 'Пустая' }],
        'apps/admin/src/ui/Table.tsx#Table': [{ id: 'rows', label: 'Строки' }],
      },
      apps,
    );
    expect(g.problems).toEqual([]);
    expect(g.groups.map((x) => [x.appId, x.folder, x.items.map((i) => i.variantId)])).toEqual([
      ['miniapp', 'src/features/feed', ['empty']],
      ['miniapp', 'src/shared/ui', ['primary', 'ghost']],
      ['admin', 'src/ui', ['rows']],
    ]);
    const first = g.groups[1]?.items[0];
    expect(first).toEqual({
      id: 'component:apps/miniapp/src/shared/ui/Button.tsx#Button/primary',
      key: 'apps/miniapp/src/shared/ui/Button.tsx#Button',
      exportName: 'Button',
      file: 'apps/miniapp/src/shared/ui/Button.tsx',
      appId: 'miniapp',
      variantId: 'primary',
      label: 'Основная',
      url: 'https://vite.localhost:5175/@lam/component?key=apps%2Fminiapp%2Fsrc%2Fshared%2Fui%2FButton.tsx%23Button&variant=primary',
    });
  });

  test('ключ вне приложений, кривой ключ и вариант — в проблемы, не в узлы', () => {
    const g = buildGallery(
      {
        'packages/ui/Button.tsx#Button': [{ id: 'a', label: 'А' }],
        'apps/miniapp/src/X.tsx': [{ id: 'a', label: 'А' }],
        'apps/miniapp/src/Y.tsx#Y': [{ id: '', label: 'Без id' }, 'строка'],
      },
      apps,
    );
    expect(g.groups).toEqual([]);
    expect(g.problems).toEqual([
      'packages/ui/Button.tsx#Button: файл не внутри приложений config.ts (apps/miniapp, apps/admin)',
      'apps/miniapp/src/X.tsx: ключ — «<файл от корня проекта>#<экспорт>»',
      'apps/miniapp/src/Y.tsx#Y: вариант без id или label',
      'apps/miniapp/src/Y.tsx#Y: вариант без id или label',
    ]);
  });

  test('components не объект — проблема', () => {
    expect(buildGallery([], apps)).toEqual({ groups: [], problems: ['components в states.ts — объект «ключ → варианты»'] });
  });

  test('адрес страницы без двойного слэша', () => {
    expect(componentPageUrl('http://localhost:16002/', 'a#B', 'v 1')).toBe('http://localhost:16002/@lam/component?key=a%23B&variant=v%201');
  });
});
