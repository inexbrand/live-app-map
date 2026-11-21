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
import { isLocalOrigin, requestPath, sendJson, type DevMiddleware } from '../dev-http';
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

async function download(opts: ModelsMiddlewareOptions, res: Res, repo: string, rev: string, file: string, target: string): Promise<void> {
  const ctrl = new AbortController();
  // Клиент ушёл (закрыл вкладку, сменил модель) — качать дальше незачем.
  // Слушаем ответ: «close» запроса у GET приходит сразу после заголовков.
  res.on('close', () => {
    if (!res.writableEnded) {
      ctrl.abort();
    }
  });
  const up = await openSource(opts, repo, rev, file, ctrl.signal);
  if (!up.ok || up.body === null) {
    sendJson(res, up.status === 404 ? 404 : 502, { ok: false, error: `модель: ${file} — HTTP ${up.status}` });
    return;
  }
  mkdirSync(path.dirname(target), { recursive: true });
  // Свой временный файл на запрос: одновременные загрузки одного файла не мешают друг другу
  const part = `${target}.${process.pid}.${randomUUID()}.part`;
  const disk = createWriteStream(part);
  let diskError: Error | null = null;
  disk.on('error', (e) => {
    diskError = e;
  });
  res.statusCode = 200;
  res.setHeader('content-type', contentType(file));
  // fetch уже распаковал gzip: длина сжатого тела клиенту не подходит
  const len = up.headers.get('content-encoding') === null ? up.headers.get('content-length') : null;
  if (len !== null) {
    res.setHeader('content-length', len);
  }
  res.setHeader('cache-control', 'no-cache');
  const reader = up.body.getReader();
  try {
    // Последний кусок уходит клиенту только после переноса файла на место:
    // получив ответ целиком, клиент уже найдёт модель на диске.
    let held: Uint8Array | null = null;
    for (;;) {
      if (ctrl.signal.aborted || res.destroyed) {
        throw new Error(`модель: ${file} — клиент отменил загрузку`);
      }
      if (diskError !== null) {
        throw diskError;
      }
      const next = await readWithin(reader, opts.idleMs, file);
      if (next.done) {
        break;
      }
      const chunk = next.value;
      disk.write(chunk);
      if (held !== null) {
        res.write(held);
      }
      held = chunk;
    }
    await new Promise<void>((resolve, reject) => disk.end((err?: Error | null) => (err ? reject(err) : resolve())));
    renameSync(part, target);
    res.end(held ?? undefined);
  } catch (err) {
    ctrl.abort();
    void reader.cancel().catch(() => undefined);
    disk.destroy();
    if (!disk.closed) {
      await new Promise<void>((resolve) => disk.once('close', () => resolve()));
    }
    rmSync(part, { force: true });
    res.destroy(err instanceof Error ? err : new Error(String(err)));
  }
}

const treeCache = new Map<string, ReadonlyMap<string, number>>();

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
    const list: unknown = await r.json();
    if (Array.isArray(list)) {
      for (const e of list) {
        if (typeof e === 'object' && e !== null && 'path' in e && 'size' in e && typeof e.path === 'string' && typeof e.size === 'number') {
          sizes.set(e.path, e.size);
        }
      }
    }
  }
  treeCache.set(`${opts.upstream}|${repo}`, sizes);
  return sizes;
}

async function handleSize(opts: ModelsMiddlewareOptions, res: Res, url: URL): Promise<void> {
  const repo = url.searchParams.get('repo') ?? '';
  if (!opts.repos.includes(repo)) {
    sendJson(res, 403, { ok: false, error: `модель не из списка: ${repo}` });
    return;
  }
  const files = (url.searchParams.get('files') ?? '').split(',').filter((f) => f !== '');
  let total = 0;
  let onDisk = 0;
  let remote: ReadonlyMap<string, number> | null = null;
  for (const f of files) {
    const local = path.join(opts.dir, repo, f);
    if (safeFile(f.split('/')) === null) {
      sendJson(res, 400, { ok: false, error: `неверный файл: ${f}` });
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

async function handle(opts: ModelsMiddlewareOptions, req: Req, res: Res): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://local');
  const parts = url.pathname.slice(MODELS_PATH.length).split('/').filter((p) => p !== '');
  const [head, ...rest] = parts;
  if (head === 'status' && req.method === 'GET') {
    sendJson(res, 200, { ok: true, models: opts.repos.map((repo) => ({ repo, ...dirBytes(path.join(opts.dir, repo)) })) });
    return;
  }
  if (head === 'size' && req.method === 'GET') {
    await handleSize(opts, res, url);
    return;
  }
  if (head === 'ort' && req.method === 'GET') {
    const name = rest.join('/');
    if (!/^ort-wasm[A-Za-z0-9._-]*\.(mjs|wasm)$/.test(name) || !existsSync(path.join(opts.ortDir, name))) {
      sendJson(res, 404, { ok: false, error: `нет файла onnxruntime: ${name}` });
      return;
    }
    serveFile(res, path.join(opts.ortDir, name));
    return;
  }
  if (head !== 'hf') {
    sendJson(res, 404, { ok: false, error: `нет такого пути: ${url.pathname}` });
    return;
  }
  const repo = rest.slice(0, 2).join('/');
  if (!opts.repos.includes(repo)) {
    sendJson(res, 403, { ok: false, error: `модель не из списка: ${repo}` });
    return;
  }
  if (req.method === 'DELETE' && rest.length === 2) {
    rmSync(path.join(opts.dir, repo), { recursive: true, force: true });
    sendJson(res, 200, { ok: true, repo });
    return;
  }
  const [, , resolve, rev = '', ...fileParts] = rest;
  const file = safeFile(fileParts);
  if (req.method !== 'GET' || resolve !== 'resolve' || !SAFE_PART.test(rev) || file === null) {
    sendJson(res, 400, { ok: false, error: 'ожидается GET hf/<repo>/resolve/<rev>/<file>' });
    return;
  }
  const target = path.join(opts.dir, repo, file);
  if (existsSync(target)) {
    serveFile(res, target);
    return;
  }
  await download(opts, res, repo, rev, file, target);
}

/**
 * Создаёт middleware моделей.
 *
 * @param opts - папки, источник и список моделей
 */
export function createModelsMiddleware(opts: ModelsMiddlewareOptions): DevMiddleware {
  return (req, res, next) => {
    const p = requestPath(req);
    if (p !== MODELS_PATH && !p.startsWith(`${MODELS_PATH}/`)) {
      next();
      return;
    }
    if (!isLocalOrigin(req)) {
      sendJson(res, 403, { ok: false, error: 'origin не локальный' });
      return;
    }
    void handle(opts, req, res).catch((err: unknown) => {
      if (!res.headersSent) {
        sendJson(res, 502, { ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    });
  };
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
