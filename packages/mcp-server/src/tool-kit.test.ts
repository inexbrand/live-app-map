/**
 * Общие части MCP-инструментов: чтение аргументов, ошибки, каталог.
 */
import { describe, expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { TOOLS, callTool } from './tools';
import { mapPathParam, optionalStr, rawStr, requiredStr, str, strList, toolCatalog } from './tool-kit';

describe('аргументы инструмента', () => {
  test('строка: как есть, без краёв, пустая для не-строки; null для пустой', () => {
    const args = { a: '  x ', n: 5, e: '   ' };
    expect(rawStr(args, 'a')).toBe('  x ');
    expect(str(args, 'a')).toBe('x');
    expect(str(args, 'n')).toBe('');
    expect(optionalStr(args, 'e')).toBeNull();
    expect(optionalStr(args, 'a')).toBe('x');
  });

  test('список: только непустые строки', () => {
    expect(strList({ f: ['a', ' ', 3, 'b'] }, 'f')).toEqual(['a', 'b']);
    expect(strList({ f: 'a' }, 'f')).toEqual([]);
  });

  test('обязательный аргумент: пустой — ошибка с именем и подсказкой', () => {
    expect(() => requiredStr({}, 'route', 'id роута')).toThrow('route обязателен: id роута');
    expect(requiredStr({ route: ' r ' }, 'route', 'id роута')).toBe('r');
  });

  test('mapPath: подсказка в ошибке — описание параметра со строчной буквы', () => {
    const p = mapPathParam('Путь к карте с разделом code');
    expect(p.prop).toEqual({ type: 'string', description: 'Путь к карте с разделом code' });
    expect(() => p.read({ mapPath: ' ' })).toThrow('mapPath обязателен: путь к карте с разделом code');
    expect(p.read({ mapPath: 'm.json' })).toBe('m.json');
  });

  test('каталог: только имя, описание и схема — обработчик не уходит в tools/list', () => {
    const cat = toolCatalog([{ name: 't', description: 'd', inputSchema: {}, handler: () => ({ content: [] }) }]);
    expect(cat).toEqual([{ name: 't', description: 'd', inputSchema: {} }]);
    expect(Object.keys(cat[0] ?? {})).toEqual(['name', 'description', 'inputSchema']);
  });
});

describe('каталог и вызов tools', () => {
  test('каталог tools/list не меняется (контракт для агентов)', () => {
    expect(TOOLS).toMatchSnapshot();
  });

  test('у каждого инструмента каталога есть обработчик; имена уникальны', () => {
    const lamDir = mkdtempSync(path.join(tmpdir(), 'lam-kit-'));
    const names = TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) {
      const r = callTool(name, {}, { lamDir });
      expect(r.content[0]?.text.startsWith('unknown tool')).toBe(false);
    }
    expect(callTool('nope', {}, { lamDir })).toEqual({ isError: true, content: [{ type: 'text', text: 'unknown tool: nope' }] });
  });

  test('пустой mapPath у инструментов кода и документации — ошибка с подсказкой, какую карту дать', () => {
    const lamDir = mkdtempSync(path.join(tmpdir(), 'lam-kit-'));
    expect(callTool('list_routes', {}, { lamDir }).content[0]?.text).toBe(
      'mapPath обязателен: путь к карте с разделом code, например maps/korbor-all.liveappmap.json',
    );
    expect(callTool('search_docs', { mapPath: '' }, { lamDir }).content[0]?.text).toBe(
      'mapPath обязателен: путь к карте с разделом docs, например maps/live-app-map.liveappmap.json',
    );
  });
});
