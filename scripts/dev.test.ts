/**
 * Разбор аргументов dev-сервера визуализатора.
 */
import { describe, expect, test } from 'bun:test';
import path from 'node:path';
import { parseDevArgs } from './dev';

describe('parseDevArgs', () => {
  const cwd = path.resolve('/repo');

  test('--project — абсолютный путь от каталога запуска, остальное — vite; порт по умолчанию 4310', () => {
    expect(parseDevArgs(['--project', '../korbor'], {}, cwd)).toEqual({ project: path.resolve(cwd, '../korbor'), vite: ['--port', '4310'] });
    expect(parseDevArgs(['--port', '4411', '--project', '/k', '--open'], {}, cwd)).toEqual({ project: path.resolve('/k'), vite: ['--port', '4411', '--open'] });
  });

  test('без --project — LAM_PROJECT или null; --project без значения — ошибка', () => {
    expect(parseDevArgs([], { LAM_PROJECT: '../k' }, cwd).project).toBe(path.resolve(cwd, '../k'));
    expect(parseDevArgs([], {}, cwd)).toEqual({ project: null, vite: ['--port', '4310'] });
    expect(() => parseDevArgs(['--project'], {}, cwd)).toThrow('--project: укажите каталог проекта');
    expect(() => parseDevArgs(['--project', '--port'], {}, cwd)).toThrow('--project');
  });
});
