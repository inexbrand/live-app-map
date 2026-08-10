/**
 * Pure iframe budget policy — без DOM.
 * Enterprise TDD §7: reconcile, priority, FSM types.
 */

export type ViewMode = 'live' | 'map-only' | 'compact';

export type FreezeStrategy = 'unmount' | 'blank' | 'hybrid';

export type IframeSlotState = 'IDLE' | 'LOADING' | 'LIVE' | 'ERROR';

export type PriorityReason = 'pinned' | 'selected' | 'visible' | 'prefetch';

export type PolicyState = {
  readonly mode: ViewMode;
  readonly maxLiveIframes: number;
  readonly maxPinned: number;
  readonly candidates: readonly string[];
  readonly pinned: ReadonlySet<string>;
  readonly visible: ReadonlySet<string>;
  readonly selected: string | null;
  readonly prefetch: ReadonlySet<string>;
  readonly iframeAllowed: Readonly<Record<string, boolean>>;
  /** Недавний LIVE score 0–5 */
  readonly recentLiveScore: Readonly<Record<string, number>>;
};

export type ReconcileResult = {
  readonly liveIds: ReadonlySet<string>;
  readonly deferredPins: readonly string[];
  readonly reasons: ReadonlyMap<string, PriorityReason>;
};

/**
 * Приоритет id: pin > selected > visible > prefetch + recency.
 */
export function priority(id: string, s: PolicyState): number {
  let p = 0;
  if (s.pinned.has(id)) {
    p += 1000;
  }
  if (s.selected === id) {
    p += 500;
  }
  if (s.visible.has(id)) {
    p += 100;
  }
  if (s.prefetch.has(id)) {
    p += 20;
  }
  p += Math.min(5, s.recentLiveScore[id] ?? 0);
  return p;
}

function primaryReason(id: string, s: PolicyState): PriorityReason {
  if (s.pinned.has(id)) {
    return 'pinned';
  }
  if (s.selected === id) {
    return 'selected';
  }
  if (s.visible.has(id)) {
    return 'visible';
  }
  return 'prefetch';
}

/**
 * Возвращает множество id, которые должны быть LIVE (бюджет maxLiveIframes).
 */
export function reconcile(s: PolicyState): ReconcileResult {
  if (s.mode !== 'live') {
    return {
      liveIds: new Set(),
      deferredPins: [],
      reasons: new Map(),
    };
  }

  const ranked = s.candidates
    .map((id) => ({ id, p: priority(id, s) }))
    .filter((x) => x.p > 0 && (s.iframeAllowed[x.id] ?? true))
    .sort((a, b) => b.p - a.p || a.id.localeCompare(b.id));

  const live = new Set<string>();
  const reasons = new Map<string, PriorityReason>();
  for (const x of ranked) {
    if (live.size >= s.maxLiveIframes) {
      break;
    }
    live.add(x.id);
    reasons.set(x.id, primaryReason(x.id, s));
  }

  const deferredPins = [...s.pinned].filter((id) => !live.has(id));

  return { liveIds: live, deferredPins, reasons };
}

/**
 * Переход FSM слота.
 */
export function transitionSlot(
  current: IframeSlotState,
  event: 'shouldLoad' | 'onLoad' | 'onError' | 'freeze',
): IframeSlotState {
  switch (event) {
    case 'shouldLoad':
      if (current === 'IDLE' || current === 'ERROR') {
        return 'LOADING';
      }
      return current;
    case 'onLoad':
      return current === 'LOADING' ? 'LIVE' : current;
    case 'onError':
      return current === 'LOADING' || current === 'LIVE' ? 'ERROR' : current;
    case 'freeze':
      return 'IDLE';
    default:
      return current;
  }
}

/**
 * Diff предыдущего и нового live-набора.
 */
export function liveDiff(
  previous: ReadonlySet<string>,
  next: ReadonlySet<string>,
): { readonly load: readonly string[]; readonly freeze: readonly string[] } {
  const load: string[] = [];
  const freeze: string[] = [];
  for (const id of next) {
    if (!previous.has(id)) {
      load.push(id);
    }
  }
  for (const id of previous) {
    if (!next.has(id)) {
      freeze.push(id);
    }
  }
  return {
    load: load.sort(),
    freeze: freeze.sort(),
  };
}

export const DEFAULT_MAX_LIVE = 8;
export const DEFAULT_MAX_PINNED = 6;
