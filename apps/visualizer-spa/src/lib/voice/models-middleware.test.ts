/**
 * /__lam_models: скачивание один раз на диск, отдача с диска без сети,
 * только разрешённые модели, wasm onnxruntime локально, размер, удаление.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { serveMiddleware, type TestServer } from '../dev-http.test-helpers';
import { createModelsMiddleware } from './models-middleware';

const REPO = 'onnx-community/whisper-base';
const WEIGHTS = Buffer.alloc(4096, 7);

let root = '';
let upstream: Server;
let upstreamUrl = '';
let hits = 0;
let server: TestServer;

beforeEach(async () => {
  root = mkdtempSync(path.join(tmpdir(), 'lam-models-'));
  mkdirSync(path.join(root, 'ort'));
  writeFileSync(path.join(root, 'ort', 'ort-wasm-simd-threaded.wasm'), Buffer.from([0, 97, 115, 109]));
  hits = 0;
  upstream = createServer((req, res) => {
    hits++;
    if (req.url === `/${REPO}/resolve/main/onnx/encoder_model_quantized.onnx`) {
      res.setHeader('content-length', String(WEIGHTS.length));
      res.end(WEIGHTS);
      return;
    }
    if (req.url === `/api/models/${REPO}/tree/main`) {
      res.end(JSON.stringify([{ path: 'config.json', size: 100 }]));
      return;
    }
    if (req.url === `/api/models/${REPO}/tree/main/onnx`) {
      res.end(JSON.stringify([{ path: 'onnx/encoder_model_quantized.onnx', size: 4096 }]));
      return;
    }
    res.statusCode = 404;
    res.end('nope');
  });
  await new Promise<void>((r) => upstream.listen(0, '127.0.0.1', r));
  upstreamUrl = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
  server = await serveMiddleware(createModelsMiddleware({ dir: path.join(root, 'models'), ortDir: path.join(root, 'ort'), upstream: upstreamUrl, repos: [REPO] }));
});

afterEach(async () => {
  await server.close();
  await new Promise<void>((r) => upstream.close(() => r()));
  rmSync(root, { recursive: true, force: true });
});

const fileUrl = (f: string): string => `/__lam_models/hf/${REPO}/resolve/main/${f}`;

describe('models middleware', () => {
  test('первый запрос качает и кладёт на диск, второй — с диска без сети', async () => {
    const first = await fetch(`${server.url}${fileUrl('onnx/encoder_model_quantized.onnx')}`);
    expect(first.headers.get('content-length')).toBe('4096');
    expect(Buffer.from(await first.arrayBuffer()).equals(WEIGHTS)).toBe(true);
    expect(existsSync(path.join(root, 'models', REPO, 'onnx', 'encoder_model_quantized.onnx'))).toBe(true);

    const before = hits;
    const second = await fetch(`${server.url}${fileUrl('onnx/encoder_model_quantized.onnx')}`);
    expect((await second.arrayBuffer()).byteLength).toBe(4096);
    expect(hits).toBe(before);

    const status = (await (await fetch(`${server.url}/__lam_models/status`)).json()) as { models: Array<{ bytes: number }> };
    expect(status.models[0]?.bytes).toBe(4096);

    const size = (await (await fetch(`${server.url}/__lam_models/size?repo=${REPO}&files=config.json,onnx/encoder_model_quantized.onnx`)).json()) as { bytes: number; bytesOnDisk: number };
    expect(size).toMatchObject({ bytes: 4196, bytesOnDisk: 4096 });

    const del = await fetch(`${server.url}/__lam_models/hf/${REPO}`, { method: 'DELETE' });
    expect(del.status).toBe(200);
    expect(existsSync(path.join(root, 'models', REPO))).toBe(false);
  });

  test('чужая модель — 403, выход из папки — 400, нет файла у источника — 404', async () => {
    expect((await fetch(`${server.url}/__lam_models/hf/evil/model/resolve/main/config.json`)).status).toBe(403);
    expect((await fetch(`${server.url}${fileUrl('..%2F..%2Fetc')}`)).status).toBe(400);
    expect((await fetch(`${server.url}${fileUrl('processor_config.json')}`)).status).toBe(404);
  });

  test('wasm onnxruntime отдаётся локально, с типом application/wasm', async () => {
    const res = await fetch(`${server.url}/__lam_models/ort/ort-wasm-simd-threaded.wasm`);
    expect(res.headers.get('content-type')).toBe('application/wasm');
    expect((await fetch(`${server.url}/__lam_models/ort/../../secret.wasm`)).status).toBe(404);
  });
});
