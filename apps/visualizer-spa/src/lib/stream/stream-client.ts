/**
 * Клиент трансляции в карте: один WebSocket на вкладку. Хранит набор экранов
 * (переотправляет после переподключения), последний кадр каждого экрана и
 * раздаёт кадры и сообщения страниц подписчикам.
 */
import { decodeFrame, type PageInput, type ServerMessage, type StreamScreen } from './stream-protocol';

/** Подписчик кадров экрана. */
export type FrameListener = (frame: Blob) => void;
/** Подписчик сообщений страниц. */
export type PageListener = (key: string, data: unknown) => void;

const RECONNECT_MS = 1000;

function isServerMessage(v: unknown): v is ServerMessage {
  return typeof v === 'object' && v !== null && 't' in v && v.t === 'page' && 'key' in v && typeof v.key === 'string';
}

/** Клиент трансляции. */
export class StreamClient {
  private ws: WebSocket | null = null;
  private connecting = false;
  private closed = false;
  private screensJson = '[]';
  private sentJson = '';
  private readonly last = new Map<string, Blob>();
  private readonly urls = new Map<string, string>();
  private readonly frameListeners = new Map<string, Set<FrameListener>>();
  private readonly pageListeners = new Set<PageListener>();

  /**
   * @param resolveUrl - адрес WebSocket сервера; null — сервера нет
   */
  constructor(private readonly resolveUrl: () => Promise<string | null>) {}

  /**
   * Набор экранов карты; тот же набор повторно не отправляется.
   *
   * @param screens - смонтированные экраны
   */
  sync(screens: readonly StreamScreen[]): void {
    this.screensJson = JSON.stringify(screens);
    this.connect();
    this.flushSync();
  }

  /**
   * Сообщение странице (как postMessage родителя в iframe).
   *
   * @param key - экран
   * @param data - сообщение
   */
  post(key: string, data: unknown): void {
    this.send(JSON.stringify({ t: 'post', key, data }));
  }

  /**
   * Ввод в страницу.
   *
   * @param key - экран
   * @param input - мышь, колесо или клавиша
   */
  input(key: string, input: PageInput): void {
    this.send(JSON.stringify({ t: 'input', key, input }));
  }

  /**
   * Последний кадр экрана как адрес картинки; кадров не было — null.
   *
   * @param key - экран
   */
  frameUrl(key: string): string | null {
    const cached = this.urls.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const blob = this.last.get(key);
    if (blob === undefined) {
      return null;
    }
    const url = URL.createObjectURL(blob);
    this.urls.set(key, url);
    return url;
  }

  /**
   * Последний кадр экрана.
   *
   * @param key - экран
   */
  lastFrame(key: string): Blob | null {
    return this.last.get(key) ?? null;
  }

  /**
   * Подписка на кадры экрана.
   *
   * @param key - экран
   * @param cb - получает каждый новый кадр
   * @returns отписка
   */
  onFrame(key: string, cb: FrameListener): () => void {
    const set = this.frameListeners.get(key) ?? new Set<FrameListener>();
    set.add(cb);
    this.frameListeners.set(key, set);
    return () => set.delete(cb);
  }

  /**
   * Подписка на сообщения страниц (отчёт, выбор элемента, отмена выбора).
   *
   * @param cb - ключ экрана и сообщение
   * @returns отписка
   */
  onPageMessage(cb: PageListener): () => void {
    this.pageListeners.add(cb);
    return () => this.pageListeners.delete(cb);
  }

  /** Закрыть соединение навсегда (тесты, выгрузка). */
  close(): void {
    this.closed = true;
    this.ws?.close();
  }

  private send(text: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(text);
    }
  }

  private flushSync(): void {
    if (this.ws?.readyState === WebSocket.OPEN && this.sentJson !== this.screensJson) {
      this.ws.send(`{"t":"sync","screens":${this.screensJson}}`);
      this.sentJson = this.screensJson;
    }
  }

  private connect(): void {
    if (this.ws !== null || this.connecting || this.closed) {
      return;
    }
    this.connecting = true;
    void this.resolveUrl()
      .then((url) => (url === null ? null : this.open(url)))
      .catch(() => null)
      .finally(() => {
        this.connecting = false;
      });
  }

  private open(url: string): void {
    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    ws.onopen = () => {
      this.sentJson = '';
      this.flushSync();
    };
    ws.onmessage = (e: MessageEvent) => this.receive(e.data);
    ws.onclose = () => {
      this.ws = null;
      if (!this.closed) {
        setTimeout(() => this.connect(), RECONNECT_MS);
      }
    };
  }

  private receive(data: unknown): void {
    if (typeof data === 'string') {
      this.receivePage(data);
      return;
    }
    if (!(data instanceof ArrayBuffer)) {
      return;
    }
    const f = decodeFrame(new Uint8Array(data));
    if (f === null) {
      return;
    }
    const blob = new Blob([f.jpeg.slice()], { type: 'image/jpeg' });
    this.last.set(f.key, blob);
    const old = this.urls.get(f.key);
    if (old !== undefined) {
      URL.revokeObjectURL(old);
      this.urls.delete(f.key);
    }
    for (const cb of this.frameListeners.get(f.key) ?? []) {
      cb(blob);
    }
  }

  private receivePage(text: string): void {
    let v: unknown;
    try {
      v = JSON.parse(text);
    } catch {
      return;
    }
    if (isServerMessage(v)) {
      for (const cb of this.pageListeners) {
        cb(v.key, v.data);
      }
    }
  }
}

/** Порт трансляции у dev-сервера визуализатора. */
async function devServerStreamUrl(): Promise<string | null> {
  const res = await fetch('/__lam_stream');
  if (!res.ok) {
    return null;
  }
  const body: unknown = await res.json();
  const port = typeof body === 'object' && body !== null && 'port' in body ? body.port : null;
  return typeof port === 'number' ? `ws://127.0.0.1:${port}/` : null;
}

/** Клиент вкладки. */
export const streamClient = new StreamClient(devServerStreamUrl);
