/**
 * Команда init: подключает Live App Map к проекту приложения.
 * Ставит @live-app-map/sdk (tarball релиза), создаёт .live-app-map/config.ts и states.ts,
 * прячет map.json в .gitignore и кладёт скилл агента. Повторный запуск ничего не дублирует
 * и не затирает файлы, которые уже есть (кроме скилла — он обновляется до версии Live App Map).
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** Репозиторий Live App Map на GitHub: релизы sdk-v* с tarball пакета. */
export const LAM_REPO = 'inexbrand/live-app-map';

/** Строка .gitignore для результата скана. */
export const MAP_GITIGNORE_LINE = '.live-app-map/map.json';

const SDK_NAME = '@live-app-map/sdk';
const VITE_CONFIGS = ['vite.config.ts', 'vite.config.mts', 'vite.config.js', 'vite.config.mjs'];
const NEXT_CONFIGS = ['next.config.ts', 'next.config.mjs', 'next.config.js'];

/** Найденное приложение: те же поля, что LamApp в config.ts. */
export type DetectedApp = {
  readonly id: string;
  readonly label: string;
  readonly dir: string;
  /** Пустая строка — порт не найден литералом, пользователь вписывает сам. */
  readonly baseUrl: string;
};

/** Приложения проекта: Vite (их подключаем) и Next (плагин lamVite к ним не подходит). */
export type DetectedApps = {
  readonly apps: readonly DetectedApp[];
  readonly nextApps: readonly string[];
};

export type InitOptions = {
  /** Корень проекта приложения. */
  readonly projectDir: string;
  /** URL или путь tarball sdk; null — последний релиз sdk-v* с GitHub. */
  readonly tarball: string | null;
  /** Исходник скилла (skills/live-app-map/SKILL.md репозитория Live App Map). */
  readonly skillSource: string;
};

export type InitReport = {
  /** Чем поставлен sdk (URL или путь tarball). */
  readonly sdkSpec: string;
  /** true — запускался bun add; false — та же версия уже в package.json. */
  readonly installed: boolean;
  /** Созданные файлы (от корня проекта). */
  readonly created: readonly string[];
  /** Файлы, которые уже были и не тронуты. */
  readonly kept: readonly string[];
  readonly apps: readonly DetectedApp[];
  /** id приложений с пустым baseUrl — вписать вручную. */
  readonly missingBaseUrl: readonly string[];
  readonly nextApps: readonly string[];
};

/** Индекс закрывающей скобки для открывающей в позиции open. */
function matchingBrace(source: string, open: number): number {
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return source.length;
}

/**
 * Порт dev-сервера из текста vite.config: только числовой литерал в блоке server.
 * Порт из переменной или env не угадывается — null.
 *
 * @param source - текст vite.config
 * @returns порт и признак https или null
 */
export function vitePort(source: string): { readonly port: number; readonly https: boolean } | null {
  const server = /\bserver\s*:\s*\{/.exec(source);
  if (server === null) return null;
  const open = server.index + server[0].length - 1;
  const block = source.slice(open, matchingBrace(source, open) + 1);
  const port = /\bport\s*:\s*(\d{2,5})\b/.exec(block);
  if (port === null) return null;
  const https = /\bbasicSsl\s*\(|plugin-basic-ssl|\bhttps\s*:/.test(source);
  return { port: Number(port[1]), https };
}

/** id приложения: строчные латинские, цифры, дефис. */
function appId(name: string): string {
  return name
    .replace(/^@[^/]+\//, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function firstExisting(dir: string, names: readonly string[]): string | null {
  for (const name of names) {
    const file = path.join(dir, name);
    if (existsSync(file)) return file;
  }
  return null;
}

function readPackageName(projectDir: string): string {
  const file = path.join(projectDir, 'package.json');
  if (!existsSync(file)) {
    throw new Error(`init: в ${projectDir} нет package.json — запустите установку в корне проекта приложения`);
  }
  const json: unknown = JSON.parse(readFileSync(file, 'utf8'));
  const name = typeof json === 'object' && json !== null && 'name' in json ? json.name : undefined;
  return typeof name === 'string' && name !== '' ? appId(name) : appId(path.basename(projectDir));
}

function appFromConfig(projectDir: string, dir: string, label: string, configFile: string): DetectedApp {
  const found = vitePort(readFileSync(configFile, 'utf8'));
  const baseUrl = found === null ? '' : `${found.https ? 'https' : 'http'}://localhost:${found.port}`;
  const rel = path.relative(projectDir, dir).split(path.sep).join('/');
  return { id: appId(label), label, dir: rel === '' ? '.' : rel, baseUrl };
}

/**
 * Приложения проекта: корень с vite.config или apps/* с vite.config.
 *
 * @param projectDir - корень проекта
 * @returns Vite-приложения (по алфавиту каталога) и каталоги Next-приложений
 */
export function detectApps(projectDir: string): DetectedApps {
  const rootConfig = firstExisting(projectDir, VITE_CONFIGS);
  if (rootConfig !== null) {
    return { apps: [appFromConfig(projectDir, projectDir, readPackageName(projectDir), rootConfig)], nextApps: [] };
  }
  const appsDir = path.join(projectDir, 'apps');
  if (!existsSync(appsDir)) return { apps: [], nextApps: [] };
  const apps: DetectedApp[] = [];
  const nextApps: string[] = [];
  const names = readdirSync(appsDir).filter((n) => statSync(path.join(appsDir, n)).isDirectory()).sort();
  for (const name of names) {
    const dir = path.join(appsDir, name);
    const viteConfig = firstExisting(dir, VITE_CONFIGS);
    if (viteConfig !== null) {
      apps.push(appFromConfig(projectDir, dir, name, viteConfig));
    } else if (firstExisting(dir, NEXT_CONFIGS) !== null) {
      nextApps.push(`apps/${name}`);
    }
  }
  return { apps: apps.sort((a, b) => a.dir.localeCompare(b.dir)), nextApps };
}

/**
 * Текст .live-app-map/config.ts.
 *
 * @param name - имя проекта
 * @param apps - приложения
 * @returns исходник с типом LamProjectConfig
 */
export function configSource(name: string, apps: readonly DetectedApp[]): string {
  const lines = apps.map((app) => {
    const baseUrl = app.baseUrl === ''
      ? "baseUrl: '', // впишите адрес dev-сервера: https://localhost:<порт>"
      : `baseUrl: '${app.baseUrl}',`;
    return [
      '    {',
      `      id: '${app.id}',`,
      `      label: '${app.label}',`,
      `      dir: '${app.dir}',`,
      `      ${baseUrl}`,
      '    },',
    ].join('\n');
  });
  return [
    "import type { LamProjectConfig } from '@live-app-map/sdk';",
    '',
    '/** Проект для Live App Map: приложения и (по желанию) каталоги бэкенда для скана API. */',
    'export const config: LamProjectConfig = {',
    `  name: '${name}',`,
    '  apps: [',
    ...lines,
    '  ],',
    "  // backend: ['apps/api'], — каталоги бэкенда: роуты API и схемы ответов попадут в карту",
    '};',
    '',
  ].join('\n');
}

/** Текст пустого .live-app-map/states.ts — заполняет агент по скиллу live-app-map. */
export const STATES_SOURCE = [
  "import type { LamComponentFixtures, LamScreenStates } from '@live-app-map/sdk';",
  '',
  '/** Состояния экранов: id экрана карты → состояния. Заполняет агент по скиллу live-app-map. */',
  'export const screens: LamScreenStates = {};',
  '',
  '/** Варианты компонентов для галереи: «файл#экспорт» → варианты. */',
  'export const components: LamComponentFixtures = {};',
  '',
].join('\n');

/**
 * Дописывает строку в текст .gitignore, если её нет.
 *
 * @param text - текущий .gitignore (может быть пустым)
 * @param line - строка
 * @returns новый текст
 */
export function ensureGitignoreLine(text: string, line: string): string {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  if (lines.includes(line)) return text;
  const base = text === '' || text.endsWith('\n') ? text : `${text}\n`;
  return `${base}${line}\n`;
}

/**
 * URL tarball последнего релиза sdk из ответа GitHub API /releases.
 *
 * @param releases - JSON ответа (массив релизов от новых к старым)
 * @returns URL tarball или null (релиза нет или ответ не массив)
 */
export function pickLatestSdkTarball(releases: unknown): string | null {
  if (!Array.isArray(releases)) return null;
  for (const release of releases) {
    const r = release as { tag_name?: unknown; draft?: unknown; prerelease?: unknown; assets?: unknown };
    if (typeof r.tag_name !== 'string' || !r.tag_name.startsWith('sdk-v') || r.draft === true || r.prerelease === true) continue;
    if (!Array.isArray(r.assets)) continue;
    for (const asset of r.assets) {
      const a = asset as { name?: unknown; browser_download_url?: unknown };
      if (typeof a.name === 'string' && /^live-app-map-sdk-.+\.tgz$/.test(a.name) && typeof a.browser_download_url === 'string') {
        return a.browser_download_url;
      }
    }
  }
  return null;
}

/** Последний релиз sdk на GitHub; нет релиза — ошибка с подсказкой. */
async function latestSdkTarball(): Promise<string> {
  const res = await fetch(`https://api.github.com/repos/${LAM_REPO}/releases?per_page=50`, {
    headers: { accept: 'application/vnd.github+json' },
  });
  const url = pickLatestSdkTarball(res.ok ? await res.json() : null);
  if (url === null) {
    throw new Error(
      `init: не нашёл релиз sdk-v* с tarball в github.com/${LAM_REPO} (HTTP ${res.status}). ` +
        'Укажите tarball: --tarball <URL или путь к live-app-map-sdk-<версия>.tgz> (в install.sh — LAM_SDK_TARBALL).',
    );
  }
  return url;
}

/** Spec, который уже записан в package.json проекта для sdk, или null. */
function currentSdkSpec(projectDir: string): string | null {
  const json = JSON.parse(readFileSync(path.join(projectDir, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  return json.devDependencies?.[SDK_NAME] ?? json.dependencies?.[SDK_NAME] ?? null;
}

async function bunAddDev(projectDir: string, spec: string): Promise<void> {
  const proc = Bun.spawn(['bun', 'add', '-d', spec], { cwd: projectDir, stdout: 'pipe', stderr: 'pipe' });
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  if (code !== 0) {
    throw new Error(`init: bun add -d ${spec} завершился с кодом ${code}\n${out}${err}`);
  }
}

/** Подсказка: как подключить плагин sdk в vite.config приложения. */
export const LAM_VITE_HINT =
  "в vite.config каждого приложения: import { lamVite } from '@live-app-map/sdk/vite'; и plugins: [..., lamVite()] (работает только в dev)";

/** Команда скана проекта из клона Live App Map. */
export function scanCommand(projectDir: string): string {
  return `bun run scan --project "${projectDir}"`;
}

/** Команда визуализатора проекта из клона Live App Map. */
export function devCommand(projectDir: string): string {
  return `bun run dev -- --project "${projectDir}"`;
}

/** Пишет файл, если его нет; возвращает true, если создал. */
function writeIfMissing(file: string, text: string): boolean {
  if (existsSync(file)) return false;
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
  return true;
}

/**
 * Подключает Live App Map к проекту.
 *
 * @param opts - проект, tarball sdk, исходник скилла
 * @returns что сделано и что вписать вручную
 */
export async function runInit(opts: InitOptions): Promise<InitReport> {
  const projectDir = path.resolve(opts.projectDir);
  const name = readPackageName(projectDir);
  const { apps, nextApps } = detectApps(projectDir);
  if (apps.length === 0) {
    const next = nextApps.length > 0 ? ` (Next-приложения ${nextApps.join(', ')} плагин lamVite не поддерживает)` : '';
    throw new Error(`init: не нашёл vite.config ни в корне, ни в apps/*${next}. Запустите установку в корне проекта с Vite-приложением.`);
  }
  if (!existsSync(opts.skillSource)) {
    throw new Error(`init: нет исходника скилла ${opts.skillSource} — переустановите Live App Map (git pull в его каталоге)`);
  }

  const resolved = opts.tarball ?? (await latestSdkTarball());
  const sdkSpec = existsSync(resolved) ? path.resolve(resolved) : resolved;
  // bun пишет локальный путь с прямыми слешами — сравниваем без разницы в слешах.
  const installed = currentSdkSpec(projectDir)?.replaceAll('\\', '/') !== sdkSpec.replaceAll('\\', '/');
  if (installed) await bunAddDev(projectDir, sdkSpec);

  const created: string[] = [];
  const kept: string[] = [];
  const files: readonly [string, string][] = [
    ['.live-app-map/config.ts', configSource(name, apps)],
    ['.live-app-map/states.ts', STATES_SOURCE],
  ];
  for (const [rel, text] of files) {
    (writeIfMissing(path.join(projectDir, rel), text) ? created : kept).push(rel);
  }

  const skillRel = '.claude/skills/live-app-map/SKILL.md';
  const skillFile = path.join(projectDir, skillRel);
  if (!existsSync(skillFile)) created.push(skillRel);
  mkdirSync(path.dirname(skillFile), { recursive: true });
  copyFileSync(opts.skillSource, skillFile);

  const gitignore = path.join(projectDir, '.gitignore');
  const before = existsSync(gitignore) ? readFileSync(gitignore, 'utf8') : '';
  const after = ensureGitignoreLine(before, MAP_GITIGNORE_LINE);
  if (after !== before) writeFileSync(gitignore, after);

  return {
    sdkSpec,
    installed,
    created,
    kept,
    apps,
    missingBaseUrl: apps.filter((a) => a.baseUrl === '').map((a) => a.id),
    nextApps,
  };
}

/**
 * Текст для пользователя после init: что сделано и что сделать руками.
 *
 * @param report - результат runInit
 * @param lamHome - каталог клона Live App Map (для команд scan/dev)
 * @param projectDir - корень проекта (для команд scan/dev)
 * @returns многострочный текст
 */
export function initSummary(report: InitReport, lamHome: string, projectDir: string): string {
  const lines: string[] = [
    report.installed ? `sdk поставлен: ${report.sdkSpec}` : `sdk уже стоит: ${report.sdkSpec}`,
    ...report.created.map((f) => `создан: ${f}`),
    ...report.kept.map((f) => `уже есть, не тронут: ${f}`),
    `приложения: ${report.apps.map((a) => `${a.id} (${a.dir})`).join(', ')}`,
  ];
  if (report.nextApps.length > 0) {
    lines.push(`пропущены Next-приложения (lamVite только для Vite): ${report.nextApps.join(', ')}`);
  }
  lines.push('', 'Дальше:');
  let step = 0;
  const add = (text: string): void => {
    step++;
    lines.push(`${step}) ${text}`);
  };
  if (report.missingBaseUrl.length > 0) {
    add(`впишите baseUrl (адрес dev-сервера) в .live-app-map/config.ts для: ${report.missingBaseUrl.join(', ')} — порт не найден числом в server.port vite.config`);
  }
  add(LAM_VITE_HINT);
  add(`скан: cd "${lamHome}" && ${scanCommand(projectDir)}`);
  add(`визуализатор: cd "${lamHome}" && ${devCommand(projectDir)}`);
  add('состояния экранов и компонентов: попросите агента в проекте «заполни состояния Live App Map» (скилл .claude/skills/live-app-map)');
  return lines.join('\n');
}
