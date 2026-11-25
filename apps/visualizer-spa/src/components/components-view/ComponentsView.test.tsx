/**
 * Вид «Компоненты»: узлы вариантов по группам, ошибки и пустая галерея; стор — разбор ответа проекта.
 */
import { useDom } from '../../test/dom';
import { beforeEach, describe, expect, test } from 'bun:test';
import { act, render } from '@testing-library/react';
import { buildGallery } from '../../lib/components-gallery/gallery';
import { useComponentsStore } from '../../store/components-store';
import { ComponentsView } from './ComponentsView';

useDom();

const apps = [{ id: 'miniapp', label: 'Мини-приложение', dir: 'apps/miniapp', baseUrl: 'https://vite.localhost:5175' }];
const components = {
  'apps/miniapp/src/shared/ui/Button.tsx#Button': [{ id: 'primary', label: 'Основная' }, { id: 'ghost', label: 'Тихая' }],
  'apps/miniapp/src/feed/Card.tsx#Card': [{ id: 'empty', label: 'Пустая' }],
  'packages/x/Y.tsx#Y': [{ id: 'a', label: 'А' }],
};

describe('вид', () => {
  test('узел на вариант, заголовки групп, проблемы внизу', async () => {
    useComponentsStore.setState({ status: 'ready', gallery: buildGallery(components, apps) });
    const ui = render(<div style={{ width: 1200, height: 800 }}><ComponentsView /></div>);
    await act(async () => {
      await Bun.sleep(30);
    });
    expect(ui.getAllByTestId('component-node').map((n) => n.getAttribute('data-component-id'))).toEqual([
      'component:apps/miniapp/src/feed/Card.tsx#Card/empty',
      'component:apps/miniapp/src/shared/ui/Button.tsx#Button/primary',
      'component:apps/miniapp/src/shared/ui/Button.tsx#Button/ghost',
    ]);
    expect(ui.getAllByTestId('component-group-title').map((n) => n.textContent)).toEqual(['Мини-приложение · src/feed', 'Мини-приложение · src/shared/ui']);
    expect(ui.getByTestId('components-problems').textContent).toContain('packages/x/Y.tsx#Y');
    ui.unmount();
  });
  test('пока грузится — подпись, не пустой холст', () => {
    useComponentsStore.setState({ status: 'loading' });
    const ui = render(<ComponentsView />);
    expect(ui.getByTestId('components-loading').textContent).toBe('Загружаю варианты компонентов проекта…');
    ui.unmount();
  });
  test('ошибка загрузки — текст ошибки', () => {
    useComponentsStore.setState({ status: 'error', error: 'проект не открыт' });
    const ui = render(<ComponentsView />);
    expect(ui.getByTestId('components-error').textContent).toBe('Галерея не загрузилась: проект не открыт');
    ui.unmount();
  });
});
