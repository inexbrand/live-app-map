/**
 * Протокол трансляции экранов: общий для карты (браузер) и dev-сервера.
 * Экраны рендерит headless-браузер на сервере, карта получает кадры JPEG
 * и шлёт обратно набор экранов, ввод и сообщения для страниц.
 */

/** Экран в трансляции: ключ — id ноды карты. */
export type StreamScreen = {
  readonly key: string;
  readonly url: string;
  readonly width: number;
  readonly height: number;
  /** Живой — кадры идут; нет — страница открыта, кадров нет (на карте последний кадр). */
  readonly live: boolean;
};

/** Ввод мыши в страницу, координаты — px страницы. */
export type MouseInput = {
  readonly kind: 'mouse';
  readonly type: 'move' | 'down' | 'up';
  readonly x: number;
  readonly y: number;
  readonly button: 'left' | 'middle' | 'right';
  readonly clickCount: number;
};

/** Колесо над страницей. */
export type WheelInput = { readonly kind: 'wheel'; readonly x: number; readonly y: number; readonly dx: number; readonly dy: number };

/** Клавиша: key — как в KeyboardEvent.key. */
export type KeyInput = { readonly kind: 'key'; readonly type: 'down' | 'up'; readonly key: string };

/** Ввод в страницу. */
export type PageInput = MouseInput | WheelInput | KeyInput;

/** Сообщение карты серверу. */
export type ClientMessage =
  | { readonly t: 'sync'; readonly screens: readonly StreamScreen[] }
  | { readonly t: 'post'; readonly key: string; readonly data: unknown }
  | { readonly t: 'input'; readonly key: string; readonly input: PageInput };

/** Сообщение сервера карте (кроме кадров): что прислала страница. */
export type ServerMessage = { readonly t: 'page'; readonly key: string; readonly data: unknown };

/** Что сделать, чтобы открытые страницы совпали с набором карты. */
export type SyncPlan = {
  readonly open: readonly StreamScreen[];
  readonly close: readonly string[];
  readonly navigate: readonly StreamScreen[];
  readonly resize: readonly StreamScreen[];
  readonly start: readonly string[];
  readonly stop: readonly string[];
};

/** Типы сообщений, которые страница шлёт карте (скрипт шлюза и пикер). */
const PAGE_TO_HOST: ReadonlySet<string> = new Set(['page', 'picked', 'pick-cancel']);

/**
 * Кадр для отправки: 2 байта длины ключа, ключ UTF-8, JPEG.
 *
 * @param key - ключ экрана
 * @param jpeg - кадр
 */
export function encodeFrame(key: string, jpeg: Uint8Array): Uint8Array {
  const k = new TextEncoder().encode(key);
  const out = new Uint8Array(2 + k.length + jpeg.length);
  out[0] = k.length >> 8;
  out[1] = k.length & 255;
  out.set(k, 2);
  out.set(jpeg, 2 + k.length);
  return out;
}

/**
 * Разбор кадра; обрезанный — null.
 *
 * @param buf - кадр целиком
 */
export function decodeFrame(buf: Uint8Array): { readonly key: string; readonly jpeg: Uint8Array } | null {
  if (buf.length < 2) {
    return null;
  }
  const len = ((buf[0] ?? 0) << 8) | (buf[1] ?? 0);
  if (buf.length < 2 + len) {
    return null;
  }
  return { key: new TextDecoder().decode(buf.subarray(2, 2 + len)), jpeg: buf.subarray(2 + len) };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isScreen(v: unknown): v is StreamScreen {
  return isRecord(v) && typeof v['key'] === 'string' && typeof v['url'] === 'string' && isNum(v['width']) && isNum(v['height']) && typeof v['live'] === 'boolean';
}

function isMouse(v: Record<string, unknown>): boolean {
  const type = v['type'];
  const button = v['button'];
  return (type === 'move' || type === 'down' || type === 'up') && (button === 'left' || button === 'middle' || button === 'right') && isNum(v['x']) && isNum(v['y']) && isNum(v['clickCount']);
}

function isInput(v: unknown): v is PageInput {
  if (!isRecord(v)) {
    return false;
  }
  if (v['kind'] === 'mouse') {
    return isMouse(v);
  }
  if (v['kind'] === 'wheel') {
    return isNum(v['x']) && isNum(v['y']) && isNum(v['dx']) && isNum(v['dy']);
  }
  return v['kind'] === 'key' && (v['type'] === 'down' || v['type'] === 'up') && typeof v['key'] === 'string';
}

function messageOf(v: Record<string, unknown>): ClientMessage | null {
  const screens = v['screens'];
  if (v['t'] === 'sync' && Array.isArray(screens) && screens.every(isScreen)) {
    return { t: 'sync', screens };
  }
  if (typeof v['key'] !== 'string') {
    return null;
  }
  if (v['t'] === 'post') {
    return { t: 'post', key: v['key'], data: v['data'] };
  }
  return v['t'] === 'input' && isInput(v['input']) ? { t: 'input', key: v['key'], input: v['input'] } : null;
}

/**
 * Разбор сообщения карты на границе сервера; неверное — null.
 *
 * @param raw - текст из WebSocket
 */
export function parseClientMessage(raw: string): ClientMessage | null {
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  return isRecord(v) ? messageOf(v) : null;
}

/**
 * План сверки: открытые страницы → набор карты. Повтор ключа — берётся первый.
 *
 * @param current - открытые сейчас
 * @param desired - нужный набор
 */
export function planSync(current: ReadonlyMap<string, StreamScreen>, desired: readonly StreamScreen[]): SyncPlan {
  const want = new Map<string, StreamScreen>();
  for (const s of desired) {
    if (!want.has(s.key)) {
      want.set(s.key, s);
    }
  }
  const open: StreamScreen[] = [];
  const navigate: StreamScreen[] = [];
  const resize: StreamScreen[] = [];
  const start: string[] = [];
  const stop: string[] = [];
  for (const s of want.values()) {
    const was = current.get(s.key);
    if (was === undefined) {
      open.push(s);
      continue;
    }
    if (was.url !== s.url) {
      navigate.push(s);
    }
    if (was.width !== s.width || was.height !== s.height) {
      resize.push(s);
    }
    if (was.live !== s.live) {
      (s.live ? start : stop).push(s.key);
    }
  }
  const close = [...current.keys()].filter((k) => !want.has(k));
  return { open, close, navigate, resize, start, stop };
}

/**
 * Точка страницы под точкой экрана: холст показывает страницу в масштабе.
 *
 * @param clientX - x на экране
 * @param clientY - y на экране
 * @param rect - коробка холста на экране
 * @param viewport - окно страницы
 */
export function toPagePoint(
  clientX: number,
  clientY: number,
  rect: { readonly left: number; readonly top: number; readonly width: number; readonly height: number },
  viewport: { readonly width: number; readonly height: number },
): { readonly x: number; readonly y: number } {
  if (rect.width <= 0 || rect.height <= 0) {
    return { x: 0, y: 0 };
  }
  return { x: Math.round(((clientX - rect.left) / rect.width) * viewport.width), y: Math.round(((clientY - rect.top) / rect.height) * viewport.height) };
}

/**
 * Сообщение страницы, которое надо отдать карте (отчёт, выбор, отмена выбора).
 *
 * @param data - data из message страницы
 */
export function isPageToHost(data: unknown): boolean {
  return isRecord(data) && typeof data['lam'] === 'string' && PAGE_TO_HOST.has(data['lam']);
}
