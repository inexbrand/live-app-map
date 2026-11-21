/**
 * Привязка замечания из ответа пикера: экран, элемент, компонент и место в
 * исходнике (карта кода или стек React), плюс перевод рамки элемента из
 * координат страницы в координаты окна визуализатора (для снимка и поля).
 */
import type { CommentAnchor } from '@live-app-map/mcp-server/comments-schema';
import type { CodeModel } from '@live-app-map/schema';
import type { LamPickedMessage, PickedComponent, PickRect } from '../gateway/pick-script';

/** Источник компонента в привязке. */
export type ComponentSource = { readonly file: string; readonly line: number | null; readonly origin: 'code-map' | 'react-stack' };

/** Экран, к которому привязано замечание. */
export type AnchorPage = { readonly id: string; readonly title: string; readonly url: string | null };

/**
 * Путь от корня приложения (как его видит dev-сервер: src/…) → путь от
 * корня репозитория по файлу экрана: apps/miniapp/src/app/routes.tsx +
 * src/features/x.tsx → apps/miniapp/src/features/x.tsx.
 *
 * @param file - путь из стека
 * @param screenFile - файл экрана из карты
 */
export function repoPath(file: string, screenFile: string | undefined): string {
  const head = file.split('/')[0] ?? '';
  if (screenFile === undefined || head === '' || screenFile.startsWith(`${head}/`)) {
    return file;
  }
  const at = screenFile.indexOf(`/${head}/`);
  return at < 0 ? file : `${screenFile.slice(0, at + 1)}${file}`;
}

/**
 * Где в коде компонент: место JSX из стека React, приведённое к пути
 * карты кода (или к корню репозитория по файлу экрана); иначе определение
 * ближайшего компонента цепочки из карты.
 *
 * @param component - компонент от пикера
 * @param code - раздел code карты (может отсутствовать)
 * @param screenFile - файл экрана (node.source.file)
 */
export function resolveComponentSource(component: PickedComponent, code: CodeModel | undefined, screenFile?: string): ComponentSource | null {
  const symbols = code?.symbols ?? [];
  const stack = component.stack;
  if (stack !== null) {
    const file = symbols.map((s) => s.location.file).find((f) => f === stack.file || f.endsWith(`/${stack.file}`));
    return { file: file ?? repoPath(stack.file, screenFile), line: stack.line, origin: 'react-stack' };
  }
  for (const name of component.chain) {
    const s = symbols.find((x) => x.kind === 'component' && x.name === name);
    if (s !== undefined) {
      return { file: s.location.file, line: s.location.line, origin: 'code-map' };
    }
  }
  return null;
}

/**
 * Привязка замечания к выбранному элементу.
 *
 * @param args - ответ пикера, экран, карта, роль, раздел code
 */
export function buildAnchor(args: {
  readonly picked: LamPickedMessage;
  readonly page: AnchorPage;
  readonly mapName: string | null;
  readonly role: string | null;
  readonly code: CodeModel | undefined;
  /** Файл экрана из карты: по нему путь из стека приводится к корню репозитория. */
  readonly screenFile?: string;
}): CommentAnchor {
  const { picked, page } = args;
  const c = picked.component;
  return {
    mapName: args.mapName,
    pageId: page.id,
    pageTitle: page.title,
    pageUrl: page.url,
    role: args.role,
    element: {
      selector: picked.selector,
      domPath: picked.domPath,
      tag: picked.tag,
      text: picked.text,
      rect: picked.rect,
      viewport: picked.viewport,
      component: c === null ? null : { name: c.name, chain: [...c.chain], source: resolveComponentSource(c, args.code, args.screenFile) },
    },
  };
}

/**
 * Рамка элемента в окне визуализатора: iframe масштабирован (холст и
 * подгонка ширины), поэтому координаты страницы умножаются на масштаб.
 *
 * @param frame - getBoundingClientRect() iframe
 * @param frameCssWidth - ширина окна страницы, CSS px (атрибут width iframe)
 * @param client - рамка элемента в окне страницы
 */
export function frameToView(frame: { readonly left: number; readonly top: number; readonly width: number }, frameCssWidth: number, client: PickRect): PickRect {
  const k = frameCssWidth > 0 ? frame.width / frameCssWidth : 1;
  return { x: frame.left + client.x * k, y: frame.top + client.y * k, width: client.width * k, height: client.height * k };
}

/**
 * Рамка с полями, обрезанная окном (для снимка: элемент плюс немного вокруг).
 *
 * @param r - рамка
 * @param pad - поле, px
 * @param bounds - размер окна
 */
export function padRect(r: PickRect, pad: number, bounds: { readonly width: number; readonly height: number }): PickRect {
  const x = Math.max(0, r.x - pad);
  const y = Math.max(0, r.y - pad);
  return { x, y, width: Math.min(bounds.width, r.x + r.width + pad) - x, height: Math.min(bounds.height, r.y + r.height + pad) - y };
}
