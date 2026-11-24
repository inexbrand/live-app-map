/**
 * Сборка @live-app-map/sdk в tarball для релиза: live-app-map-sdk-<версия>.tgz.
 *
 * В монорепо пакет работает от src (exports → ./src/*.ts). Здесь каждая точка из exports
 * собирается bun build в dist/*.js (ESM), типы — tsc в dist/*.d.ts, затем во временной папке
 * пишется package.json с exports на dist и делается npm pack.
 *
 * Запуск: bun run --cwd packages/sdk pack [--out <каталог для .tgz>]
 */
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** Поля package.json пакета, которые читает сборка. */
export type SdkManifest = {
  readonly name: string;
  readonly version: string;
  readonly description?: string;
  readonly license?: string;
  readonly exports: Readonly<Record<string, string>>;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly peerDependencies?: Readonly<Record<string, string>>;
  readonly peerDependenciesMeta?: Readonly<Record<string, unknown>>;
};

/** Точка входа: ключ exports, исходник src и имя в dist без расширения. */
export type SdkEntry = { readonly key: string; readonly source: string; readonly out: string };

/**
 * Точки входа из exports: каждое значение — путь ./src/<имя>.ts.
 *
 * @param manifest - package.json пакета
 * @returns точки входа
 */
export function sdkEntries(manifest: SdkManifest): readonly SdkEntry[] {
  return Object.entries(manifest.exports).map(([key, source]) => {
    const m = /^\.\/src\/(.+)\.tsx?$/.exec(source);
    if (m === null || m[1] === undefined) {
      throw new Error(`pack: exports["${key}"] = "${source}" — ожидается путь ./src/<файл>.ts`);
    }
    return { key, source, out: m[1] };
  });
}

/**
 * package.json для tarball: exports на dist, только dist в files, зависимости как в исходном.
 *
 * @param manifest - package.json пакета в монорепо
 * @returns package.json для публикации
 */
export function publishManifest(manifest: SdkManifest): Record<string, unknown> {
  const exportsMap: Record<string, { types: string; import: string }> = {};
  for (const entry of sdkEntries(manifest)) {
    exportsMap[entry.key] = { types: `./dist/${entry.out}.d.ts`, import: `./dist/${entry.out}.js` };
  }
  const optional = (key: keyof SdkManifest): Record<string, unknown> =>
    manifest[key] === undefined ? {} : { [key]: manifest[key] };
  return {
    name: manifest.name,
    version: manifest.version,
    type: 'module',
    ...optional('description'),
    ...optional('license'),
    exports: exportsMap,
    files: ['dist'],
    ...optional('dependencies'),
    ...optional('peerDependencies'),
    ...optional('peerDependenciesMeta'),
  };
}

/** Имя tarball, которое даёт npm pack: @scope/name → scope-name-<версия>.tgz. */
export function tarballName(manifest: SdkManifest): string {
  return `${manifest.name.replace(/^@/, '').replace('/', '-')}-${manifest.version}.tgz`;
}

function run(cmd: readonly string[], cwd: string): string {
  const res = Bun.spawnSync([...cmd], { cwd, stdout: 'pipe', stderr: 'pipe' });
  if (res.exitCode !== 0) {
    throw new Error(`pack: ${cmd.join(' ')} → код ${res.exitCode}\n${res.stdout.toString()}${res.stderr.toString()}`);
  }
  return res.stdout.toString();
}

/**
 * Собирает tarball.
 *
 * @param pkgDir - каталог packages/sdk
 * @param outDir - куда положить .tgz
 * @returns путь к .tgz
 */
export async function packSdk(pkgDir: string, outDir: string): Promise<string> {
  const manifest = JSON.parse(readFileSync(path.join(pkgDir, 'package.json'), 'utf8')) as SdkManifest;
  const entries = sdkEntries(manifest);
  const dist = path.join(pkgDir, 'dist');
  rmSync(dist, { recursive: true, force: true });

  const external = [...Object.keys(manifest.dependencies ?? {}), ...Object.keys(manifest.peerDependencies ?? {})];
  const built = await Bun.build({
    entrypoints: entries.map((e) => path.join(pkgDir, e.source)),
    root: path.join(pkgDir, 'src'),
    outdir: dist,
    format: 'esm',
    target: 'node',
    splitting: true,
    external,
  });
  if (!built.success) {
    throw new Error(`pack: bun build упал\n${built.logs.map(String).join('\n')}`);
  }
  run(['bun', 'x', 'tsc', '-p', 'tsconfig.build.json'], pkgDir);
  for (const entry of entries) {
    for (const ext of ['.js', '.d.ts']) {
      if (!existsSync(path.join(dist, entry.out + ext))) {
        throw new Error(`pack: после сборки нет dist/${entry.out}${ext}`);
      }
    }
  }

  const stage = mkdtempSync(path.join(tmpdir(), 'lam-sdk-pack-'));
  try {
    cpSync(dist, path.join(stage, 'dist'), { recursive: true });
    for (const extra of ['README.md', 'LICENSE']) {
      if (existsSync(path.join(pkgDir, extra))) cpSync(path.join(pkgDir, extra), path.join(stage, extra));
    }
    writeFileSync(path.join(stage, 'package.json'), `${JSON.stringify(publishManifest(manifest), null, 2)}\n`);
    mkdirSync(outDir, { recursive: true });
    run(['npm', 'pack', '--pack-destination', outDir], stage);
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
  const file = path.join(outDir, tarballName(manifest));
  if (!existsSync(file)) throw new Error(`pack: npm pack не создал ${file}`);
  return file;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const i = args.indexOf('--out');
  const outDir = path.resolve(i === -1 ? '.' : (args[i + 1] ?? '.'));
  const file = await packSdk(path.resolve(import.meta.dir, '..'), outDir);
  console.log(file);
}
