/**
 * Карта Expo (expo-map.json в .appmap): разбор и перевод в экраны и рёбра live-app-map.
 */
import { type LiveAppMapEdge, type LiveAppMapPage } from '@live-app-map/schema';
import { isPlainObject, readString } from './json-read';

/** Узел expo-map v2 (map.json nodes[]). */
export type ExpoMapNode = {
  readonly id?: string;
  readonly slug?: string;
  readonly title?: string;
  readonly urlPath?: string;
  readonly group?: string;
  readonly presentation?: string;
  readonly file?: string;
  readonly navigator?: string;
  readonly params?: unknown;
  readonly capture?: ExpoMapCapture;
};

/** Снимок экрана в capture-поле узла expo-map. */
export type ExpoMapCapture = {
  readonly screenshot?: string;
};

/** Ребро expo-map v2 (map.json edges[]). */
export type ExpoMapEdge = {
  readonly id?: string;
  readonly from?: string;
  readonly to?: string | null;
  readonly raw?: string;
};

/** Корневая структура map.json expo-map. */
export type ExpoMapJson = {
  readonly nodes?: readonly ExpoMapNode[];
  readonly edges?: readonly ExpoMapEdge[];
};


/**
 * Сузить capture-поле узла.
 * @param value — raw capture
 */
export function parseExpoCapture(value: unknown): ExpoMapCapture | undefined {
  if (!isPlainObject(value)) {
    return undefined;
  }
  const screenshot = readString(value['screenshot']);
  if (screenshot === undefined) {
    return {};
  }
  return { screenshot };
}

/**
 * Сузить один узел expo-map из JSON.
 * @param value — элемент nodes[]
 */
export function parseExpoMapNode(value: unknown): ExpoMapNode | null {
  if (!isPlainObject(value)) {
    return null;
  }
  const node: ExpoMapNode = {
    id: readString(value['id']),
    slug: readString(value['slug']),
    title: readString(value['title']),
    urlPath: readString(value['urlPath']),
    group: readString(value['group']),
    presentation: readString(value['presentation']),
    file: readString(value['file']),
    navigator: readString(value['navigator']),
    params: value['params'],
    capture: parseExpoCapture(value['capture']),
  };
  return node;
}

/**
 * Сузить одно ребро expo-map из JSON.
 * @param value — элемент edges[]
 */
export function parseExpoMapEdge(value: unknown): ExpoMapEdge | null {
  if (!isPlainObject(value)) {
    return null;
  }
  const toRaw = value['to'];
  let to: string | null | undefined;
  if (toRaw === null) {
    to = null;
  } else {
    to = readString(toRaw);
  }
  return {
    id: readString(value['id']),
    from: readString(value['from']),
    to,
    raw: readString(value['raw']),
  };
}

/**
 * Разобрать map.json как expo-map (nodes/edges) или null.
 * @param value — parsed JSON
 */
export function parseExpoMapJson(value: unknown): ExpoMapJson | null {
  if (!isPlainObject(value)) {
    return null;
  }
  const nodesRaw = value['nodes'];
  if (!Array.isArray(nodesRaw)) {
    return null;
  }
  const nodes: ExpoMapNode[] = [];
  for (const item of nodesRaw) {
    const node = parseExpoMapNode(item);
    if (node !== null) {
      nodes.push(node);
    }
  }
  const edges: ExpoMapEdge[] = [];
  const edgesRaw = value['edges'];
  if (Array.isArray(edgesRaw)) {
    for (const item of edgesRaw) {
      const edge = parseExpoMapEdge(item);
      if (edge !== null) {
        edges.push(edge);
      }
    }
  }
  return { nodes, edges };
}


/**
 * Expo-узел → LiveAppMapPage.
 * @param n — узел
 * @param screens — бинарники screens/
 */
export function expoNodeToPage(
  n: ExpoMapNode,
  screens: ReadonlyMap<string, Uint8Array>,
): LiveAppMapPage {
  const id = n.id ?? n.slug ?? '';
  const slug = n.slug !== undefined ? n.slug : id;
  let screenshot: string | null = null;
  if (screens.has(`${slug}.png`)) {
    screenshot = `screens/${slug}.png`;
  } else if (n.capture?.screenshot !== undefined && n.capture.screenshot.length > 0) {
    screenshot = n.capture.screenshot;
  }
  return {
    id,
    title: n.title ?? n.id ?? slug,
    path: n.urlPath,
    group: n.group,
    type: n.presentation === 'modal' ? 'modal' : 'route',
    screenshot,
    metadata: {
      slug,
      sourceFile: n.file,
      navigator: n.navigator,
      params: n.params,
    },
  };
}

/**
 * Expo-ребро → LiveAppMapEdge (только с валидным to).
 * @param e — ребро
 * @param index — индекс для fallback id
 */
export function expoEdgeToLive(e: ExpoMapEdge, index: number): LiveAppMapEdge | null {
  if (e.to === null || e.to === undefined) {
    return null;
  }
  const from = e.from;
  if (from === undefined || from.length === 0) {
    return null;
  }
  return {
    id: e.id !== undefined ? e.id : `e${index}`,
    from,
    to: e.to,
    raw: e.raw,
    kind: 'navigation',
  };
}
