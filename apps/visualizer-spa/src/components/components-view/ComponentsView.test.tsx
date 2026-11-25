/**
 * Вид «Компоненты»: узлы вариантов по группам, ошибки и пустая галерея; стор — разбор ответа проекта.
 */
import { useDom } from '../../test/dom';
import { beforeEach, describe, expect, test } from 'bun:test';
import { act, render } from '@testing-library/react';
import { buildGallery } from '../../lib/components-gallery/gallery';
import { useComponentsStore } from '../../store/components-store';
import { useGatewayStore } from '../../store/gateway-store';
import { MAX_LIVE_COMPONENTS } from '../../lib/components-gallery/stream-screens';
import { SNAPSHOT_SLOTS } from '../../lib/gateway/snapshot-slots';
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
  test('варианты вне живых — снимок /__lam_snapshot через шлюз, по очереди загрузки', async () => {
    useGatewayStore.setState({ port: 4322 });
    const many = { 'apps/miniapp/src/ui/B.tsx#B': Array.from({ length: MAX_LIVE_COMPONENTS + 2 }, (_, i) => ({ id: 'v' + i, label: 'В' + i })) };
    // Ни один не видим — ни один не транслируется: все узлы замороженные
    useComponentsStore.setState({ status: 'ready', gallery: buildGallery(many, apps), visible: new Set() });
    const ui = render(<div style={{ width: 1200, height: 800 }}><ComponentsView /></div>);
    await act(async () => {
      await Bun.sleep(30);
    });
    const nodes = ui.getAllByTestId('component-node');
    expect(nodes.filter((n) => n.querySelector('canvas') !== null)).toHaveLength(0);
    const shots = nodes.flatMap((n) => [...n.querySelectorAll('img[data-lam-snapshot]')].map((i) => i.getAttribute('src') ?? ''));
    // Картинки не грузятся в happy-dom: места заняты первыми SNAPSHOT_SLOTS, остальные ждут
    expect(shots).toHaveLength(SNAPSHOT_SLOTS);
    expect(shots.every((s) => s.startsWith('/__lam_snapshot?url=http%3A%2F%2Fanon--s5175-vite--'))).toBe(true);
    ui.unmount();
    useGatewayStore.setState({ port: null });
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
