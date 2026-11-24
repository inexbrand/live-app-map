/**
 * Состояния экранов узлами карты. Состояние по контракту sdk (у него есть id) —
 * отдельный узел рядом с экраном: тот же адрес, своя роль входа, параметр
 * `lam_state=<экран>/<состояние>` (рантайм sdk подменяет по нему API) и шаги
 * после загрузки. Старые состояния (name/inject) остаются переключателем на ноде.
 */
import type { AppMapDocument, AppMapNode, AppMapPageState, AppMapStateKind, AppMapStateStep } from '@live-app-map/schema';

/**
 * Параметр адреса, которым визуализатор просит у рантайма состояние экрана.
 * То же значение, что LAM_STATE_PARAM в packages/sdk/src/project.ts.
 */
export const LAM_STATE_PARAM = 'lam_state';

/** Разделитель id экрана и id состояния в id узла-состояния. */
const STATE_ID_SEP = '@state:';
/** Ключ metadata узла-состояния. */
const META_KEY = 'lamState';

/** Состояния проекта: id экрана карты → состояния (экспорт screens из states.ts). */
export type ProjectScreenStates = ReadonlyMap<string, readonly AppMapPageState[]>;

/** Что известно об узле-состоянии. */
export type StateNodeInfo = {
  readonly screenId: string;
  readonly stateId: string;
  readonly label: string;
  readonly kind: AppMapStateKind;
  readonly role: string | undefined;
  readonly steps: readonly AppMapStateStep[];
};

/**
 * id узла-состояния.
 *
 * @param screenId - id экрана
 * @param stateId - id состояния
 */
export function stateNodeId(screenId: string, stateId: string): string {
  return `${screenId}${STATE_ID_SEP}${stateId}`;
}

/**
 * Значение параметра lam_state: `<экран>/<состояние>` (рантайм делит по последнему «/»).
 *
 * @param screenId - id экрана
 * @param stateId - id состояния
 */
export function lamStateValue(screenId: string, stateId: string): string {
  return `${screenId}/${stateId}`;
}

/** Состояние по контракту sdk: у него есть id. */
function isContractState(st: AppMapPageState): st is AppMapPageState & { readonly id: string } {
  return typeof st.id === 'string' && st.id !== '';
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/**
 * Узел-состояние ли это; да — его экран, состояние, подпись, вид, роль и шаги.
 *
 * @param node - узел карты
 */
export function stateNodeInfo(node: AppMapNode): StateNodeInfo | null {
  const meta = node.metadata?.[META_KEY];
  const st = node.states?.[0];
  if (!isRecord(meta) || typeof meta['screenId'] !== 'string' || st === undefined || !isContractState(st)) {
    return null;
  }
  return { screenId: meta['screenId'], stateId: st.id, label: st.label ?? st.id, kind: st.kind ?? 'ui', role: st.role ?? st.inject?.role, steps: st.steps ?? [] };
}

/**
 * Состояния экранов из states.ts поверх состояний карты: одноимённое (по id или name)
 * заменяется, новые добавляются в конец; экраны, которых нет в карте, пропускаются.
 *
 * @param doc - карта
 * @param project - состояния проекта
 */
export function mergeProjectStates(doc: AppMapDocument, project: ProjectScreenStates | null): AppMapDocument {
  if (project === null || project.size === 0) {
    return doc;
  }
  let changed = false;
  const nodes = doc.nodes.map((n) => {
    const own = project.get(n.id);
    if (own === undefined || own.length === 0) {
      return n;
    }
    changed = true;
    const keys = new Set(own.map((s) => s.id ?? s.name));
    const kept = (n.states ?? []).filter((s) => !keys.has(s.id ?? s.name));
    return { ...n, states: [...kept, ...own] };
  });
  return changed ? { ...doc, nodes } : doc;
}

/** Узел-состояние экрана. */
function stateNode(screen: AppMapNode, st: AppMapPageState & { readonly id: string }): AppMapNode {
  const role = st.role ?? st.inject?.role;
  const state: AppMapPageState = {
    ...st,
    inject: {
      ...st.inject,
      ...(role === undefined ? {} : { role }),
      query: { ...st.inject?.query, [LAM_STATE_PARAM]: lamStateValue(screen.id, st.id) },
    },
  };
  return {
    ...screen,
    id: stateNodeId(screen.id, st.id),
    title: `${screen.title} · ${st.label ?? st.id}`,
    states: [state],
    defaultPinned: false,
    screenshot: null,
    metadata: { ...screen.metadata, [META_KEY]: { screenId: screen.id, stateId: st.id } },
  };
}

/**
 * Карта с узлами-состояниями: каждый узел — сразу за своим экраном.
 * show = false — карта как есть.
 *
 * @param doc - карта (с уже слитыми состояниями проекта)
 * @param show - показывать ли состояния узлами
 */
export function expandStateNodes(doc: AppMapDocument, show: boolean): AppMapDocument {
  if (!show || !doc.nodes.some((n) => n.states?.some(isContractState) === true)) {
    return doc;
  }
  const nodes = doc.nodes.flatMap((n) => {
    if (n.kind === 'service' || stateNodeInfo(n) !== null) {
      return [n];
    }
    return [n, ...(n.states ?? []).filter(isContractState).map((st) => stateNode(n, st))];
  });
  return { ...doc, nodes };
}
