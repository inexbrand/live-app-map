import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  configSource,
  detectApps,
  ensureGitignoreLine,
  pickLatestSdkTarball,
  runInit,
  vitePort,
} from './init';
import { runCli } from './commands';

const SKILL = path.resolve(import.meta.dir, '../../../skills/live-app-map/SKILL.md');
const dirs: string[] = [];

/** Временный проект: package.json и файлы по относительным путям. */
function project(files: Record<string, string>): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'lam-init-'));
  dirs.push(dir);
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), text);
  }
  return dir;
}

function read(dir: string, rel: string): string {
  return readFileSync(path.join(dir, rel), 'utf8');
}

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('vitePort', () => {
  test('литерал server.port и https от basicSsl', () => {
    expect(vitePort("import basicSsl from '@vitejs/plugin-basic-ssl';\nexport default { plugins: [basicSsl()], server: { host: true, port: 5175 } };"))
      .toEqual({ port: 5175, https: true });
  });
  test('порт вне server (preview) не берётся', () => {
    expect(vitePort('export default { preview: { port: 4000 }, server: { open: true } };')).toBeNull();
  });
  test('порт из переменной — не угадывается', () => {
    expect(vitePort('const p = portFromEnv(env, "X", 16002);\nexport default { server: { port: p } };')).toBeNull();
  });
});

describe('detectApps', () => {
  test('apps/* с vite.config, Next — отдельно, без конфига — пропуск', () => {
    const dir = project({
      'package.json': '{"name":"@acme/shop"}',
      'apps/Web_App/vite.config.ts': 'export default { server: { port: 5173 } };',
      'apps/admin/vite.config.mts': 'export default {};',
      'apps/site/next.config.ts': 'export default {};',
      'apps/api/package.json': '{}',
    });
    const found = detectApps(dir);
    expect(found.apps).toEqual([
      { id: 'web-app', label: 'Web_App', dir: 'apps/Web_App', baseUrl: 'http://localhost:5173' },
      { id: 'admin', label: 'admin', dir: 'apps/admin', baseUrl: '' },
    ].sort((a, b) => a.dir.localeCompare(b.dir)));
    expect(found.nextApps).toEqual(['apps/site']);
  });
  test('одно приложение в корне проекта', () => {
    const dir = project({ 'package.json': '{"name":"solo"}', 'vite.config.js': 'export default { server: { port: 3000 } }' });
    expect(detectApps(dir).apps).toEqual([{ id: 'solo', label: 'solo', dir: '.', baseUrl: 'http://localhost:3000' }]);
  });
});

describe('configSource', () => {
  test('пустой baseUrl помечен подсказкой, типы — import type', () => {
    const src = configSource('shop', [{ id: 'admin', label: 'admin', dir: 'apps/admin', baseUrl: '' }]);
    expect(src).toContain("import type { LamProjectConfig } from '@live-app-map/sdk';");
    expect(src).toContain("baseUrl: '', // впишите адрес dev-сервера");
    expect(src).toContain("name: 'shop'");
  });
});

describe('ensureGitignoreLine', () => {
  test('дописывает один раз и сохраняет перевод строки', () => {
    const once = ensureGitignoreLine('node_modules', '.live-app-map/map.json');
    expect(once).toBe('node_modules\n.live-app-map/map.json\n');
    expect(ensureGitignoreLine(once, '.live-app-map/map.json')).toBe(once);
    expect(ensureGitignoreLine('', '.live-app-map/map.json')).toBe('.live-app-map/map.json\n');
  });
});

describe('pickLatestSdkTarball', () => {
  test('берёт первый не-черновик sdk-v* с tgz', () => {
    const releases = [
      { tag_name: 'v2', draft: false, prerelease: false, assets: [{ name: 'x.tgz', browser_download_url: 'u0' }] },
      { tag_name: 'sdk-v0.3.0', draft: true, prerelease: false, assets: [{ name: 'live-app-map-sdk-0.3.0.tgz', browser_download_url: 'u1' }] },
      { tag_name: 'sdk-v0.2.0', draft: false, prerelease: false, assets: [{ name: 'live-app-map-sdk-0.2.0.tgz', browser_download_url: 'u2' }] },
    ];
    expect(pickLatestSdkTarball(releases)).toBe('u2');
    expect(pickLatestSdkTarball([])).toBeNull();
    expect(pickLatestSdkTarball({ message: 'API rate limit' })).toBeNull();
  });
});

describe('runInit', () => {
  test('создаёт .live-app-map, .gitignore, скилл; повтор ничего не дублирует и не затирает', async () => {
    const dir = project({
      'package.json': '{"name":"shop","devDependencies":{"@live-app-map/sdk":"file:sdk.tgz"}}',
      '.gitignore': 'node_modules\n',
      'apps/web/vite.config.ts': 'export default { server: { port: 5173 } };',
      'apps/admin/vite.config.ts': 'export default {};',
    });
    const first = await runInit({ projectDir: dir, tarball: 'file:sdk.tgz', skillSource: SKILL });
    expect(first.installed).toBe(false);
    expect(first.created).toEqual(['.live-app-map/config.ts', '.live-app-map/states.ts', '.claude/skills/live-app-map/SKILL.md']);
    expect(first.missingBaseUrl).toEqual(['admin']);
    expect(read(dir, '.live-app-map/states.ts')).toContain('export const screens: LamScreenStates = {};');
    expect(read(dir, '.live-app-map/states.ts')).toContain('export const components: LamComponentFixtures = {};');
    expect(read(dir, '.claude/skills/live-app-map/SKILL.md')).toBe(readFileSync(SKILL, 'utf8'));

    writeFileSync(path.join(dir, '.live-app-map/config.ts'), '// правка пользователя\n');
    const second = await runInit({ projectDir: dir, tarball: 'file:sdk.tgz', skillSource: SKILL });
    expect(second.created).toEqual([]);
    expect(second.kept).toEqual(['.live-app-map/config.ts', '.live-app-map/states.ts']);
    expect(read(dir, '.live-app-map/config.ts')).toBe('// правка пользователя\n');
    expect(read(dir, '.gitignore')).toBe('node_modules\n.live-app-map/map.json\n');
  });

  test('команда init печатает созданное и что вписать', async () => {
    const dir = project({
      'package.json': '{"name":"shop","devDependencies":{"@live-app-map/sdk":"file:sdk.tgz"}}',
      'apps/admin/vite.config.ts': 'export default {};',
    });
    const out: string[] = [];
    const code = await runCli(['init', '--project', dir, '--tarball', 'file:sdk.tgz'], {
      log: (t) => out.push(t),
      error: (t) => out.push(t),
      cwd: dir,
      now: () => new Date(),
    });
    expect(code).toBe(0);
    const text = out.join('\n');
    expect(text).toContain('создан: .live-app-map/config.ts');
    expect(text).toContain('впишите baseUrl (адрес dev-сервера) в .live-app-map/config.ts для: admin');
    expect(text).toContain(`--project "${dir}"`);
  });

  test('без package.json — понятная ошибка', async () => {
    const dir = project({ 'apps/web/vite.config.ts': '' });
    await expect(runInit({ projectDir: dir, tarball: 'file:x.tgz', skillSource: SKILL })).rejects.toThrow('package.json');
  });

  test('без vite-приложений — ошибка с подсказкой', async () => {
    const dir = project({ 'package.json': '{"name":"x"}' });
    await expect(runInit({ projectDir: dir, tarball: 'file:x.tgz', skillSource: SKILL })).rejects.toThrow('vite.config');
  });

  test('ставит настоящий tarball через bun add -d', async () => {
    const pkg = project({ 'package.json': '{"name":"@live-app-map/sdk","version":"9.9.9","main":"index.js"}', 'index.js': 'export const x = 1;' });
    const packed = Bun.spawnSync(['npm', 'pack', '--silent'], { cwd: pkg });
    expect(packed.exitCode).toBe(0);
    const tgz = path.join(pkg, packed.stdout.toString().trim());
    const dir = project({ 'package.json': '{"name":"shop"}', 'vite.config.ts': 'export default {}' });
    const report = await runInit({ projectDir: dir, tarball: tgz, skillSource: SKILL });
    expect(report.installed).toBe(true);
    expect(existsSync(path.join(dir, 'node_modules/@live-app-map/sdk/index.js'))).toBe(true);
    const json = JSON.parse(read(dir, 'package.json')) as { devDependencies: Record<string, string> };
    expect(Object.keys(json.devDependencies)).toEqual(['@live-app-map/sdk']);
  }, 60_000);
});
