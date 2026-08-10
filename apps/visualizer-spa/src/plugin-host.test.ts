import { beforeEach, describe, expect, test } from 'bun:test';
import {
  applyVisualizerPlugins,
  createVisualizerPluginApi,
  getRegisteredToolbarButtons,
  initPluginHost,
  resetPluginHost,
  type VisualizerHostPlugin,
} from './plugin-host';

describe('plugin-host', () => {
  beforeEach(() => {
    resetPluginHost();
  });

  test('пустой plugins → no-op, registry пуст (production-safe)', () => {
    initPluginHost([]);
    expect(getRegisteredToolbarButtons()).toEqual([]);
  });

  test('initPluginHost без аргументов — no-op', () => {
    initPluginHost();
    expect(getRegisteredToolbarButtons()).toHaveLength(0);
  });

  test('плагин без visualizer не регистрирует кнопки', () => {
    const idle: VisualizerHostPlugin = { name: 'scan-only' };
    applyVisualizerPlugins([idle]);
    expect(getRegisteredToolbarButtons()).toEqual([]);
  });

  test('register button: id и label попадают в registry', () => {
    const clicks: string[] = [];
    const plugin: VisualizerHostPlugin = {
      name: 'a11y-panel',
      version: '1.0.0',
      visualizer(api) {
        api.addToolbarButton({
          id: 'a11y',
          label: 'A11y checklist',
          onClick: () => {
            clicks.push('a11y');
          },
        });
      },
    };

    applyVisualizerPlugins([plugin]);

    const buttons = getRegisteredToolbarButtons();
    expect(buttons).toHaveLength(1);
    expect(buttons[0]?.id).toBe('a11y');
    expect(buttons[0]?.label).toBe('A11y checklist');
    buttons[0]?.onClick();
    expect(clicks).toEqual(['a11y']);
  });

  test('несколько плагинов накапливают кнопки', () => {
    const a: VisualizerHostPlugin = {
      name: 'a',
      visualizer(api) {
        api.addToolbarButton({
          id: 'btn-a',
          label: 'A',
          onClick: () => undefined,
        });
      },
    };
    const b: VisualizerHostPlugin = {
      name: 'b',
      visualizer(api) {
        api.addToolbarButton({
          id: 'btn-b',
          label: 'B',
          onClick: () => undefined,
        });
      },
    };

    applyVisualizerPlugins([a, b]);

    const ids = getRegisteredToolbarButtons().map((btn) => btn.id);
    expect(ids).toEqual(['btn-a', 'btn-b']);
  });

  test('повторный id заменяет запись, не дублирует', () => {
    const api = createVisualizerPluginApi();
    api.addToolbarButton({
      id: 'x',
      label: 'First',
      onClick: () => undefined,
    });
    api.addToolbarButton({
      id: 'x',
      label: 'Second',
      onClick: () => undefined,
    });

    const buttons = getRegisteredToolbarButtons();
    expect(buttons).toHaveLength(1);
    expect(buttons[0]?.label).toBe('Second');
  });

  test('пустой id/label → Error', () => {
    const api = createVisualizerPluginApi();
    expect(() =>
      api.addToolbarButton({
        id: '  ',
        label: 'ok',
        onClick: () => undefined,
      }),
    ).toThrow(/id/);
    expect(() =>
      api.addToolbarButton({
        id: 'ok',
        label: '',
        onClick: () => undefined,
      }),
    ).toThrow(/label/);
  });

  test('initPluginHost сбрасывает предыдущий registry', () => {
    applyVisualizerPlugins([
      {
        name: 'old',
        visualizer(api) {
          api.addToolbarButton({
            id: 'old',
            label: 'Old',
            onClick: () => undefined,
          });
        },
      },
    ]);
    expect(getRegisteredToolbarButtons()).toHaveLength(1);

    initPluginHost([
      {
        name: 'new',
        visualizer(api) {
          api.addToolbarButton({
            id: 'new',
            label: 'New',
            onClick: () => undefined,
          });
        },
      },
    ]);

    const buttons = getRegisteredToolbarButtons();
    expect(buttons).toHaveLength(1);
    expect(buttons[0]?.id).toBe('new');
  });

  test('getRegisteredToolbarButtons возвращает копию (immutable snapshot)', () => {
    const api = createVisualizerPluginApi();
    api.addToolbarButton({
      id: 'c',
      label: 'C',
      onClick: () => undefined,
    });
    const snap = [...getRegisteredToolbarButtons()];
    snap.pop();
    expect(getRegisteredToolbarButtons()).toHaveLength(1);
  });
});
