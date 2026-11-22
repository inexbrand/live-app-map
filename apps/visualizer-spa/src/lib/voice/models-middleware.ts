/**
 * Модели распознавания речи через dev-сервер: `/__lam_models/`.
 * - `GET hf/<repo>/resolve/<rev>/<file>` — файл модели: с диска
 *   (`.lam-models/`, вне git), а если его нет — один раз копируется из
 *   зеркала (LAM_MODELS_MIRROR) или скачивается с Hugging Face и
 *   сохраняется. Модели — только из списка (не открытый прокси);
 * - `GET ort/<file>` — wasm onnxruntime из node_modules (без CDN);
 * - `GET size?repo=&files=` — сколько весят файлы (диск или каталог HF);
 * - `GET status` — что уже лежит на диске;
 * - `DELETE hf/<repo>` — удалить модель с диска.
 * Звук сюда не приходит: распознавание идёт в браузере.
 */
import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { resolveLamDir } from '@live-app-map/mcp-server';
import { localEndpointMiddleware, sendError, sendJson, underPath, type DevMiddleware } from '../dev-http';
import { VOICE_MODELS } from './models';

/** Корень эндпоинтов. */
export const MODELS_PATH = '/__lam_models';

/** Опции middleware. */
export type ModelsMiddlewareOptions = {
  /** Папка моделей на диске. */
  readonly dir: string;
  /** Папка dist onnxruntime-web. */
  readonly ortDir: string;
  /** Откуда качать: https://huggingface.co. */
  readonly upstream: string;
  /** Папка готовых моделей (общий диск команды): файл берётся оттуда, к источнику — только при промахе. */
  readonly mirror?: string;
  /** Сколько ждать следующего куска от источника, мс; дольше — обрыв загрузки. */
  readonly idleMs: number;
  /** Разрешённые репозитории. */
  readonly repos: readonly string[];
};

type Req = Parameters<DevMiddleware>[0];
type Res = Parameters<DevMiddleware>[1];

const SAFE_PART = /^[A-Za-z0-9._-]+$/;

function safeFile(parts: readonly string[]): string | null {
  return parts.length > 0 && parts.every((p) => SAFE_PART.test(p) && p !== '..' && p !== '.') ? parts.join('/') : null;
}

function contentType(file: string): string {
  if (file.endsWith('.json')) {
    return 'application/json; charset=utf-8';
  }
  if (file.endsWith('.wasm')) {
    return 'application/wasm';
  }
  if (file.endsWith('.mjs') || file.endsWith('.js')) {
    return 'text/javascript; charset=utf-8';
  }
  return 'application/octet-stream';
}

function serveFile(res: Res, file: string): void {
  res.statusCode = 200;
  res.setHeader('content-type', contentType(file));
  res.setHeader('content-length', String(statSync(file).size));
  res.setHeader('cache-control', 'no-cache');
  createReadStream(file).pipe(res);
}

function dirBytes(dir: string): { readonly bytes: number; readonly files: readonly string[] } {
  if (!existsSync(dir)) {
    return { bytes: 0, files: [] };
  }
  let bytes = 0;
  const files: string[] = [];
  const walk = (d: string, rel: string): void => {
    for (const name of readdirSync(d)) {
      const full = path.join(d, name);
      const st = statSync(full);
      if (st.isDirectory()) {
        walk(full, `${rel}${name}/`);
      } else if (!name.endsWith('.part')) {
        bytes += st.size;
        files.push(`${rel}${name}`);
      }
    }
  };
  walk(dir, '');
  return { bytes, files: files.sort() };
}

/** Файл как поток кусков для того же пути, что и ответ источника. */
function fileStream(file: string): ReadableStream<Uint8Array> {
  const s = createReadStream(file);
  return new ReadableStream<Uint8Array>({
    start(c) {
      s.on('data', (d) => c.enqueue(typeof d === 'string' ? new TextEncoder().encode(d) : new Uint8Array(d)));
      s.on('end', () => c.close());
      s.on('error', (e) => c.error(e));
    },
    cancel() {
      s.destroy();
    },
  });
}

/** Источник файла: зеркало на диске или HTTP. */
async function openSource(opts: ModelsMiddlewareOptions, repo: string, rev: string, file: string, signal: AbortSignal): Promise<Response> {
  const mirrored = opts.mirror === undefined ? null : path.join(opts.mirror, repo, file);
  if (mirrored !== null && existsSync(mirrored)) {
    return new Response(fileStream(mirrored), { headers: { 'content-length': String(statSync(mirrored).size) } });
  }
  return fetch(`${opts.upstream}/${repo}/resolve/${rev}/${file}`, { signal });
}

/** Следующий кусок, но не дольше idleMs: зависший источник обрывается. */
type Chunk = { readonly done: true } | { readonly done: false; readonly value: Uint8Array };

function readWithin(reader: ReadableStreamDefaultReader<Uint8Array>, idleMs: number, file: string): Promise<Chunk> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`модель: ${file} — источник молчит ${Math.round(idleMs / 1000)} с`)), idleMs);
    reader.read().then(
      (v) => {
        clearTimeout(t);
        resolve(v.done || v.value === undefined ? { done: true } : { done: false, value: v.value });
      },
      (e: unknown) => {
        clearTimeout(t);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}

/** Клиент ушёл (закрыл вкладку, сменил модель) — качать дальше незачем. */
function abortOnClientGone(res: Res): AbortController {
  const ctrl = new AbortController();
  // Слушаем ответ: «close» запроса у GET приходит сразу после заголовков.
  res.on('close', () => {
    if (!res.writableEnded) {
      ctrl.abort();
    }
  });
  return ctrl;
}

/** Временный файл загрузки и первая ошибка записи на диск. */
type PartFile = { readonly stream: ReturnType<typeof createWriteStream>; readonly error: () => Error | null };

function openPart(part: string): PartFile {
  const stream = createWriteStream(part);
  let error: Error | null = null;
  stream.on('error', (e) => {
    error = e;
  });
  return { stream, error: () => error };
}

/** Заголовки ответа: тип, длина (если тело не распаковано), без кэша. */
function startStream(res: Res, file: string, headers: Headers): void {
  res.statusCode = 200;
  res.setHeader('content-type', contentType(file));
  // fetch уже распаковал gzip: длина сжатого тела клиенту не подходит
  const len = headers.get('content-encoding') === null ? headers.get('content-length') : null;
  if (len !== null) {
    res.setHeader('content-length', len);
  }
  res.setHeader('cache-control', 'no-cache');
}

/**
 * Куски источника — на диск и клиенту; последний кусок придерживается: клиенту он
 * уходит только после переноса файла на место (получив ответ целиком, клиент уже
 * найдёт модель на диске).
 *
 * @returns придержанный последний кусок
 */
async function pump(reader: ReadableStreamDefaultReader<Uint8Array>, disk: PartFile, res: Res, signal: AbortSignal, idleMs: number, file: string): Promise<Uint8Array | null> {
  let held: Uint8Array | null = null;
  for (;;) {
    if (signal.aborted || res.destroyed) {
      throw new Error(`модель: ${file} — клиент отменил загрузку`);
    }
    const diskError = disk.error();
    if (diskError !== null) {
      throw diskError;
    }
    const next = await readWithin(reader, idleMs, file);
    if (next.done) {
      return held;
    }
    disk.stream.write(next.value);
    if (held !== null) {
      res.write(held);
    }
    held = next.value;
  }
}

/** Загрузка сорвалась: оборвать источник, закрыть и удалить временный файл. */
async function discard(ctrl: AbortController, reader: ReadableStreamDefaultReader<Uint8Array>, disk: PartFile, part: string): Promise<void> {
  ctrl.abort();
  void reader.cancel().catch(() => undefined);
  disk.stream.destroy();
  if (!disk.stream.closed) {
    await new Promise<void>((resolve) => disk.stream.once('close', () => resolve()));
  }
  rmSync(part, { force: true });
}

async function download(opts: ModelsMiddlewareOptions, res: Res, repo: string, rev: string, file: string, target: string): Promise<void> {
  const ctrl = abortOnClientGone(res);
  const up = await openSource(opts, repo, rev, file, ctrl.signal);
  if (!up.ok || up.body === null) {
    sendError(res, up.status === 404 ? 404 : 502, `модель: ${file} — HTTP ${up.status}`);
    return;
  }
  mkdirSync(path.dirname(target), { recursive: true });
  // Свой временный файл на запрос: одновременные загрузки одного файла не мешают друг другу
  const part = `${target}.${process.pid}.${randomUUID()}.part`;
  const disk = openPart(part);
  startStream(res, file, up.headers);
  const reader = up.body.getReader();
  try {
    const held = await pump(reader, disk, res, ctrl.signal, opts.idleMs, file);
    await new Promise<void>((resolve, reject) => disk.stream.end((err?: Error | null) => (err ? reject(err) : resolve())));
    renameSync(part, target);
    res.end(held ?? undefined);
  } catch (err) {
    await discard(ctrl, reader, disk, part);
    res.destroy(err instanceof Error ? err : new Error(String(err)));
  }
}

const treeCache = new Map<string, ReadonlyMap<string, number>>();

/** Файлы и размеры из ответа каталога Hugging Face (лишнее пропускается). */
function treeEntries(list: unknown): [string, number][] {
  if (!Array.isArray(list)) {
    return [];
  }
  return list.flatMap((e: unknown): [string, number][] => {
    const file: unknown = typeof e === 'object' && e !== null ? Reflect.get(e, 'path') : undefined;
    const size: unknown = typeof e === 'object' && e !== null ? Reflect.get(e, 'size') : undefined;
    return typeof file === 'string' && typeof size === 'number' ? [[file, size]] : [];
  });
}

async function upstreamSizes(opts: ModelsMiddlewareOptions, repo: string): Promise<ReadonlyMap<string, number>> {
  const cached = treeCache.get(`${opts.upstream}|${repo}`);
  if (cached !== undefined) {
    return cached;
  }
  const sizes = new Map<string, number>();
  for (const sub of ['', '/onnx']) {
    const r = await fetch(`${opts.upstream}/api/models/${repo}/tree/main${sub}`);
    if (!r.ok) {
      throw new Error(`каталог модели ${repo}: HTTP ${r.status}`);
    }
    for (const [file, size] of treeEntries(await r.json())) {
      sizes.set(file, size);
    }
  }
  treeCache.set(`${opts.upstream}|${repo}`, sizes);
  return sizes;
}

async function handleSize(opts: ModelsMiddlewareOptions, res: Res, url: URL): Promise<void> {
  const repo = url.searchParams.get('repo') ?? '';
  if (!opts.repos.includes(repo)) {
    sendError(res, 403, `модель не из списка: ${repo}`);
    return;
  }
  const files = (url.searchParams.get('files') ?? '').split(',').filter((f) => f !== '');
  let total = 0;
  let onDisk = 0;
  let remote: ReadonlyMap<string, number> | null = null;
  for (const f of files) {
    const local = path.join(opts.dir, repo, f);
    if (safeFile(f.split('/')) === null) {
      sendError(res, 400, `неверный файл: ${f}`);
      return;
    }
    if (existsSync(local)) {
      const s = statSync(local).size;
      total += s;
      onDisk += s;
      continue;
    }
    remote ??= await upstreamSizes(opts, repo);
    total += remote.get(f) ?? 0;
  }
  sendJson(res, 200, { ok: true, repo, bytes: total, bytesOnDisk: onDisk });
}

/** wasm onnxruntime из node_modules. */
async function handleOrt(opts: ModelsMiddlewareOptions, res: Res, _url: URL, rest: readonly string[]): Promise<void> {
  const name = rest.join('/');
  if (!/^ort-wasm[A-Za-z0-9._-]*\.(mjs|wasm)$/.test(name) || !existsSync(path.join(opts.ortDir, name))) {
    sendError(res, 404, `нет файла onnxruntime: ${name}`);
    return;
  }
  serveFile(res, path.join(opts.ortDir, name));
}

/** Что уже лежит на диске. */
async function handleStatus(opts: ModelsMiddlewareOptions, res: Res): Promise<void> {
  sendJson(res, 200, { ok: true, models: opts.repos.map((repo) => ({ repo, ...dirBytes(path.join(opts.dir, repo)) })) });
}

/** GET-эндпоинты кроме файлов моделей. */
const GET_ROUTES: ReadonlyMap<string, (opts: ModelsMiddlewareOptions, res: Res, url: URL, rest: readonly string[]) => Promise<void>> = new Map([
  ['status', handleStatus],
  ['size', handleSize],
  ['ort', handleOrt],
]);

/** Ревизия и файл из `<repo>/resolve/<rev>/<file>`; не тот вид — null. */
function hfFileOf(rest: readonly string[]): { readonly rev: string; readonly file: string } | null {
  const [, , resolve, rev = '', ...fileParts] = rest;
  const file = safeFile(fileParts);
  return resolve !== 'resolve' || !SAFE_PART.test(rev) || file === null ? null : { rev, file };
}

/** Модели: удалить с диска или отдать файл (с диска, иначе — скачать и сохранить). */
async function handleHf(opts: ModelsMiddlewareOptions, req: Req, res: Res, rest: readonly string[]): Promise<void> {
  const repo = rest.slice(0, 2).join('/');
  if (!opts.repos.includes(repo)) {
    sendError(res, 403, `модель не из списка: ${repo}`);
    return;
  }
  if (req.method === 'DELETE' && rest.length === 2) {
    rmSync(path.join(opts.dir, repo), { recursive: true, force: true });
    sendJson(res, 200, { ok: true, repo });
    return;
  }
  const hf = req.method === 'GET' ? hfFileOf(rest) : null;
  if (hf === null) {
    sendError(res, 400, 'ожидается GET hf/<repo>/resolve/<rev>/<file>');
    return;
  }
  const target = path.join(opts.dir, repo, hf.file);
  if (existsSync(target)) {
    serveFile(res, target);
    return;
  }
  await download(opts, res, repo, hf.rev, hf.file, target);
}

async function handle(opts: ModelsMiddlewareOptions, req: Req, res: Res): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://local');
  const [head = '', ...rest] = url.pathname.slice(MODELS_PATH.length).split('/').filter((p) => p !== '');
  if (head === 'hf') {
    await handleHf(opts, req, res, rest);
    return;
  }
  const route = req.method === 'GET' ? GET_ROUTES.get(head) : undefined;
  if (route === undefined) {
    sendError(res, 404, `нет такого пути: ${url.pathname}`);
    return;
  }
  await route(opts, res, url, rest);
}

/**
 * Создаёт middleware моделей.
 *
 * @param opts - папки, источник и список моделей
 */
export function createModelsMiddleware(opts: ModelsMiddlewareOptions): DevMiddleware {
  return localEndpointMiddleware({
    matches: underPath(MODELS_PATH),
    errorStatus: 502,
    handle: (req, res) => handle(opts, req, res),
  });
}

/** Переменная окружения: своя папка моделей. */
export const LAM_MODELS_DIR_ENV = 'LAM_MODELS_DIR';

/** Переменная окружения: папка готовых моделей (общий диск команды). */
export const LAM_MODELS_MIRROR_ENV = 'LAM_MODELS_MIRROR';

/**
 * Папка dist onnxruntime-web (зависимость transformers.js).
 */
export function resolveOrtDir(): string {
  const req = createRequire(import.meta.url);
  const transformers = req.resolve('@huggingface/transformers');
  return path.dirname(createRequire(transformers).resolve('onnxruntime-web'));
}

/**
 * Папка моделей: `$LAM_MODELS_DIR`, иначе `<корень монорепо>/.lam-models`.
 *
 * @param start - откуда искать корень
 */
export function resolveModelsDir(start: string): string {
  const env = process.env[LAM_MODELS_DIR_ENV]?.trim() ?? '';
  return env !== '' ? path.resolve(env) : path.join(path.dirname(resolveLamDir(start, '')), '.lam-models');
}

const mirrorEnv = process.env[LAM_MODELS_MIRROR_ENV]?.trim() ?? '';

/** Middleware для vite.config. */
export const modelsMiddleware: DevMiddleware = createModelsMiddleware({
  dir: resolveModelsDir(process.cwd()),
  ortDir: resolveOrtDir(),
  upstream: 'https://huggingface.co',
  mirror: mirrorEnv === '' ? undefined : path.resolve(mirrorEnv),
  idleMs: 60_000,
  repos: VOICE_MODELS.map((m) => m.repo),
});
