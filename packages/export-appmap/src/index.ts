/**
 * Bridge liveappmap / AppMapDocument ↔ .appmap zip (expo-map v2 subset).
 */
import JSZip from 'jszip';
import {
  appMapToLiveAppMap,
  liveAppMapToAppMap,
  parseLiveAppMapDocument,
  type AppMapDocument,
  type LiveAppMapDocument,
} from '@live-app-map/schema';

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
 * Распаковать .appmap / zip в LiveAppMapDocument.
 */
export async function parseAppMapZip(
  data: ArrayBuffer | Uint8Array,
): Promise<AppMapZipParseResult> {
  const warnings: string[] = [];
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    return { ok: false, errors: ['INVALID_ZIP: не удалось открыть архив'] };
  }

  const mapFile = zip.file('map.json');
  if (!mapFile) {
    return { ok: false, errors: ['MISSING_MAP_JSON'] };
  }
  let mapJson: unknown;
  try {
    mapJson = JSON.parse(await mapFile.async('string')) as unknown;
  } catch {
    return { ok: false, errors: ['INVALID_JSON: map.json'] };
  }

  let manifest: {
    formatVersion?: number;
    generator?: string;
    app?: { name?: string; platform?: string; scheme?: string };
    generatedAt?: string;
  } = {};
  const manifestFile = zip.file('manifest.json');
  if (manifestFile) {
    try {
      manifest = JSON.parse(await manifestFile.async('string')) as typeof manifest;
    } catch {
      warnings.push('manifest.json unreadable');
    }
  } else {
    warnings.push('manifest.json missing');
  }

  const screens = new Map<string, Uint8Array>();
  const screenFolder = zip.folder('screens');
  if (screenFolder) {
    const tasks: Promise<void>[] = [];
    screenFolder.forEach((relativePath, file) => {
      if (file.dir) {
        return;
      }
      tasks.push(
        file.async('uint8array').then((buf) => {
          screens.set(relativePath, buf);
        }),
      );
    });
    await Promise.all(tasks);
  }

  // expo-map map.json: nodes[] with urlPath, slug, edges[]
  const raw = mapJson as {
    nodes?: Array<Record<string, unknown>>;
    edges?: Array<Record<string, unknown>>;
  };
  if (!raw.nodes || !Array.isArray(raw.nodes)) {
    // maybe already liveappmap?
    const direct = parseLiveAppMapDocument(mapJson);
    if (direct.ok) {
      return { ok: true, document: direct.document, screens, warnings };
    }
    return { ok: false, errors: ['map.json: нет nodes[]'] };
  }

  const pages = raw.nodes.map((n) => {
    const id = String(n.id ?? n.slug ?? '');
    const slug = n.slug !== undefined ? String(n.slug) : id;
    const shot = screens.has(`${slug}.png`)
      ? `screens/${slug}.png`
      : n.capture && typeof n.capture === 'object' && n.capture !== null
        ? String((n.capture as { screenshot?: string }).screenshot ?? '')
        : null;
    return {
      id,
      title: String(n.title ?? n.id ?? slug),
      path: n.urlPath !== undefined ? String(n.urlPath) : undefined,
      group: n.group !== undefined ? String(n.group) : undefined,
      type:
        n.presentation === 'modal'
          ? 'modal'
          : ('route' as string),
      screenshot: shot || null,
      metadata: {
        slug,
        sourceFile: n.file,
        navigator: n.navigator,
        params: n.params,
      },
    };
  });

  const edges = (raw.edges ?? [])
    .filter((e) => e.to !== null && e.to !== undefined)
    .map((e, i) => ({
      id: e.id !== undefined ? String(e.id) : `e${i}`,
      from: String(e.from),
      to: String(e.to),
      raw: e.raw !== undefined ? String(e.raw) : undefined,
      kind: 'navigation',
    }));

  const document: LiveAppMapDocument = {
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

  return { ok: true, document, screens, warnings };
}

/**
 * Упаковать AppMapDocument в .appmap zip (bytes).
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
