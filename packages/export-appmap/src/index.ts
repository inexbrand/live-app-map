/**
 * Bridge liveappmap / AppMapDocument ↔ .appmap zip (expo-map v2 subset).
 */
import JSZip from 'jszip';
import { appMapToLiveAppMap, liveAppMapToAppMap, parseLiveAppMapDocument, type AppMapDocument, type LiveAppMapDocument, type LiveAppMapEdge } from '@live-app-map/schema';
import { isPlainObject, readString } from './json-read';
import { expoEdgeToLive, expoNodeToPage, parseExpoMapJson } from './expo-map';
export type { ExpoMapCapture, ExpoMapEdge, ExpoMapJson, ExpoMapNode } from './expo-map';

/** Поля manifest.json .appmap zip. */
export type AppMapZipManifest = {
  readonly formatVersion?: number;
  readonly generator?: string;
  readonly generatedAt?: string;
  readonly app?: {
    readonly name?: string;
    readonly platform?: string;
    readonly scheme?: string;
  };
};

export type AppMapZipParseResult =
  | {
      readonly ok: true;
      readonly document: LiveAppMapDocument;
      readonly screens: ReadonlyMap<string, Uint8Array>;
      readonly warnings: readonly string[];
    }
  | {
      readonly ok: false;
      readonly errors: readonly string[];
    };

/**
 * Сообщение из unknown catch (без silent swallow).
 * @param err — значение из catch
 * @returns текст для errors[] / warnings[]
 */
function errorDetail(err: unknown): string {
  const text = messageOf(err);
  return text === '' ? 'unknown error' : text;
}

function messageOf(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return typeof err === 'string' ? err : '';
}

/**
 * Разобрать manifest.json .appmap.
 * @param value — parsed JSON
 */
function parseAppMapZipManifest(value: unknown): AppMapZipManifest {
  if (!isPlainObject(value)) {
    return {};
  }
  const appRaw = value['app'];
  let app: AppMapZipManifest['app'];
  if (isPlainObject(appRaw)) {
    app = {
      name: readString(appRaw['name']),
      platform: readString(appRaw['platform']),
      scheme: readString(appRaw['scheme']),
    };
  }
  const formatVersionRaw = value['formatVersion'];
  const formatVersion =
    typeof formatVersionRaw === 'number' && Number.isFinite(formatVersionRaw)
      ? formatVersionRaw
      : undefined;
  return {
    formatVersion,
    generator: readString(value['generator']),
    generatedAt: readString(value['generatedAt']),
    app,
  };
}

/**
 * Распаковать .appmap / zip в LiveAppMapDocument.
 * @param data — bytes zip
 */
export async function parseAppMapZip(
  data: ArrayBuffer | Uint8Array,
): Promise<AppMapZipParseResult> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch (err: unknown) {
    return { ok: false, errors: [`INVALID_ZIP: не удалось открыть архив (${errorDetail(err)})`] };
  }
  const map = await readMapJson(zip);
  if (!map.ok) {
    return map;
  }
  const { manifest, warnings } = await readManifest(zip);
  const screens = await readScreens(zip);
  const expo = parseExpoMapJson(map.json);
  if (expo === null || expo.nodes === undefined) {
    const direct = parseLiveAppMapDocument(map.json);
    return direct.ok
      ? { ok: true, document: direct.document, screens, warnings }
      : { ok: false, errors: ['INVALID_MAP: map.json без nodes[] и не liveappmap'] };
  }
  return { ok: true, document: expoDocument(expo.nodes, expo.edges ?? [], manifest, screens), screens, warnings };
}

/** map.json архива: нет файла или не JSON — ошибка с кодом. */
async function readMapJson(zip: JSZip): Promise<{ readonly ok: true; readonly json: unknown } | { readonly ok: false; readonly errors: string[] }> {
  const mapFile = zip.file('map.json');
  if (!mapFile) {
    return { ok: false, errors: ['MISSING_MAP_JSON'] };
  }
  try {
    return { ok: true, json: JSON.parse(await mapFile.async('string')) };
  } catch (err: unknown) {
    return { ok: false, errors: [`INVALID_JSON: map.json (${errorDetail(err)})`] };
  }
}

/** manifest.json необязателен: нет или нечитаем — предупреждение и пустой manifest. */
async function readManifest(zip: JSZip): Promise<{ readonly manifest: AppMapZipManifest; readonly warnings: string[] }> {
  const manifestFile = zip.file('manifest.json');
  if (!manifestFile) {
    return { manifest: {}, warnings: ['MANIFEST_MISSING: manifest.json отсутствует'] };
  }
  try {
    const rawManifest: unknown = JSON.parse(await manifestFile.async('string'));
    return { manifest: parseAppMapZipManifest(rawManifest), warnings: [] };
  } catch (err: unknown) {
    return { manifest: {}, warnings: [`MANIFEST_UNREADABLE: ${errorDetail(err)}`] };
  }
}

/** Снимки экранов из папки screens/ архива (путь внутри папки → байты). */
async function readScreens(zip: JSZip): Promise<Map<string, Uint8Array>> {
  const screens = new Map<string, Uint8Array>();
  const tasks: Promise<void>[] = [];
  zip.folder('screens')?.forEach((relativePath, file) => {
    if (!file.dir) {
      tasks.push(file.async('uint8array').then((buf) => void screens.set(relativePath, buf)));
    }
  });
  await Promise.all(tasks);
  return screens;
}

type ExpoParsed = NonNullable<ReturnType<typeof parseExpoMapJson>>;

/** Документ liveappmap из карты Expo: страницы, рёбра и сведения manifest. */
function expoDocument(
  nodes: NonNullable<ExpoParsed['nodes']>,
  rawEdges: NonNullable<ExpoParsed['edges']>,
  manifest: AppMapZipManifest,
  screens: ReadonlyMap<string, Uint8Array>,
): LiveAppMapDocument {
  const pages = nodes.map((n) => expoNodeToPage(n, screens));
  const edges: LiveAppMapEdge[] = rawEdges.flatMap((edge, i) => {
    const liveEdge = expoEdgeToLive(edge, i);
    return liveEdge === null ? [] : [liveEdge];
  });
  return {
    version: '1.0',
    app: {
      name: manifest.app?.name,
      platform: manifest.app?.platform,
      generator: manifest.generator,
      generatedAt: manifest.generatedAt,
    },
    pages,
    edges,
    extensions: {
      appmap: {
        formatVersion: manifest.formatVersion ?? 2,
        scheme: manifest.app?.scheme,
      },
    },
  };
}

/**
 * Упаковать AppMapDocument в .appmap zip (bytes).
 * @param doc — enterprise document
 */
export async function exportAppMapZip(doc: AppMapDocument): Promise<Uint8Array> {
  const live = appMapToLiveAppMap(doc);
  const zip = new JSZip();
  zip.file(
    'manifest.json',
    JSON.stringify(
      {
        formatVersion: 2,
        generator: `${doc.generator.name}/${doc.generator.version}`,
        generatedAt: doc.generatedAt,
        app: {
          name: doc.project.name ?? 'app',
          platform: 'web',
        },
      },
      null,
      2,
    ),
  );
  zip.file(
    'map.json',
    JSON.stringify(
      {
        nodes: live.pages.map((p) => ({
          id: p.id,
          title: p.title,
          urlPath: p.path,
          group: p.group,
          file: p.metadata?.['sourceFile'],
          slug: p.id,
          presentation: p.type === 'modal' ? 'modal' : 'card',
        })),
        edges: live.edges.map((e) => ({
          from: e.from,
          to: e.to,
          raw: e.raw,
        })),
        flows: [],
      },
      null,
      2,
    ),
  );
  zip.file('liveappmap.json', JSON.stringify(live, null, 2));
  const buf = await zip.generateAsync({ type: 'uint8array' });
  return buf;
}

export { liveAppMapToAppMap, appMapToLiveAppMap };
