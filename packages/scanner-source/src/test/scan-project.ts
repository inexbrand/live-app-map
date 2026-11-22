/**
 * Тестовый проект во временном каталоге: монорепо с одним сервисом apps/x.
 */
import { afterAll } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ApiRoute, CodeModel } from '@live-app-map/schema';
import { scanSource } from '../index';
import type { SourceScanResult } from '../scan-source';

const dirs: string[] = [];

afterAll(() => {
  for (const d of dirs) {
    rmSync(d, { recursive: true, force: true });
  }
});

/**
 * Пишет проект во временный каталог. Пути от apps/x; путь с ведущим «/» — от корня репо.
 *
 * @param files - файлы проекта
 * @returns корень проекта
 */
export function writeProject(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'lam-scan-'));
  dirs.push(root);
  const all: Record<string, string> = {
    'package.json': JSON.stringify({ name: 'fx', private: true, workspaces: ['apps/*'] }),
    'apps/x/package.json': JSON.stringify({ name: '@fx/x' }),
    ...Object.fromEntries(Object.entries(files).map(([f, text]) => [f.startsWith('/') ? f.slice(1) : `apps/x/${f}`, text])),
  };
  for (const [f, text] of Object.entries(all)) {
    mkdirSync(path.dirname(path.join(root, f)), { recursive: true });
    writeFileSync(path.join(root, f), text);
  }
  return root;
}

/**
 * Полный результат скана проекта из файлов.
 *
 * @param files - файлы проекта (см. writeProject)
 * @returns результат scanSource
 */
export function scanProject(files: Record<string, string>): SourceScanResult {
  return scanSource({ root: writeProject(files) });
}

/**
 * Модель кода проекта из файлов.
 *
 * @param files - файлы проекта (см. writeProject)
 * @returns code результата скана
 */
export function scan(files: Record<string, string>): CodeModel {
  return scanProject(files).code;
}

/**
 * Вызовы API строками «МЕТОД путь клиент [via обёртка]», по алфавиту.
 *
 * @param code - модель кода
 * @returns строки вызовов
 */
export function callLines(code: CodeModel): string[] {
  return (code.apiCalls ?? []).map((c) => `${c.method} ${c.path} ${c.client}${c.via === undefined ? '' : ` via ${c.via}`}`).sort();
}

/**
 * Роут по методу и пути; нет — исключение со списком найденных.
 *
 * @param code - модель кода
 * @param method - метод
 * @param routePath - путь
 * @returns роут
 */
export function route(code: CodeModel, method: string, routePath: string): ApiRoute {
  const found = code.routes.find((r) => r.method === method && r.path === routePath);
  if (found === undefined) {
    throw new Error(`нет роута ${method} ${routePath}; есть: ${code.routes.map((r) => `${r.method} ${r.path}`).join(', ')}`);
  }
  return found;
}
