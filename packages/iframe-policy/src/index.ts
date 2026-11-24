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
  const base = basePriority(id, s);
  return base + Math.min(5, s.recentLiveScore[id] ?? 0);
}

/** Есть ли у экрана причина жить: закреплён, выбран, виден или сосед выбранного. Недавняя живость — не причина. */
function basePriority(id: string, s: PolicyState): number {
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
    .filter((id) => basePriority(id, s) > 0 && (s.iframeAllowed[id] ?? true))
    .map((id) => ({ id, p: priority(id, s) }))
    .sort((a, b) => b.p - a.p || a.id.localeCompare(b.id));

  const live = new Set<string>();
  const reasons = new Map<string, PriorityReason>();
  // maxLiveIframes <= 0 или >= 9999 → без лимита (все с priority > 0)
  const unlimited = s.maxLiveIframes <= 0 || s.maxLiveIframes >= 9999;
  for (const x of ranked) {
    if (!unlimited && live.size >= s.maxLiveIframes) {
      break;
    }
    live.add(x.id);
    reasons.set(x.id, primaryReason(x.id, s));
  }

  const deferredPins = [...s.pinned].filter((id) => !live.has(id));

  return { liveIds: live, deferredPins, reasons };
}

/** Переходы слота по событию: из какого состояния — в какое; не указано — остаётся. */
const SLOT_MOVES: Readonly<Record<'shouldLoad' | 'onLoad' | 'onError', ReadonlyMap<IframeSlotState, IframeSlotState>>> = {
  shouldLoad: new Map([['IDLE', 'LOADING'], ['ERROR', 'LOADING']]),
  onLoad: new Map([['LOADING', 'LIVE']]),
  onError: new Map([['LOADING', 'ERROR'], ['LIVE', 'ERROR']]),
};

/**
 * Переход FSM слота.
 */
export function transitionSlot(
  current: IframeSlotState,
  event: 'shouldLoad' | 'onLoad' | 'onError' | 'freeze',
): IframeSlotState {
  if (event === 'freeze') {
    return 'IDLE';
  }
  return SLOT_MOVES[event].get(current) ?? current;
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

/**
 * Бюджет live iframe (enterprise TDD §7): multi-iframe, не «все сразу».
 * 9999 в UI = opt-in unlimited.
 */
export const DEFAULT_MAX_LIVE = 6;
/** Pin soft-cap; excess pins → deferred toast, live режет maxLive. */
export const DEFAULT_MAX_PINNED = 6;
/**
 * Keep-alive: iframe остаётся в DOM (state SPA не сбрасывается) после
 * выхода из live-бюджета. LRU, pin защищён.
 */
export const DEFAULT_MAX_WARM = 2;

export type WarmPoolInput = {
  /** Текущий live-набор после reconcile */
  readonly liveIds: ReadonlySet<string>;
  /** Предыдущий live (до этого recompute) */
  readonly previousLiveIds: ReadonlySet<string>;
  /**
   * LRU warm: **сначала старые** (index 0 = жертва eviction).
   * Не включает id, которые сейчас live.
   */
  readonly previousWarmOrder: readonly string[];
  readonly pinned: ReadonlySet<string>;
  /** Сколько слотов держать «тёплыми» сверх live */
  readonly maxWarm: number;
  /** id → можно ли монтировать iframe */
  readonly iframeAllowed: Readonly<Record<string, boolean>>;
};

export type WarmPoolResult = {
  /** Только warm (не live), LRU oldest-first */
  readonly warmOrder: readonly string[];
  readonly warmIds: ReadonlySet<string>;
  /** live ∪ warm — iframe остаётся в DOM */
  readonly mountedIds: ReadonlySet<string>;
};

function isAllowed(
  id: string,
  iframeAllowed: Readonly<Record<string, boolean>>,
): boolean {
  return iframeAllowed[id] ?? true;
}

/** Пока пул больше предела — убрать самый старый незакреплённый; все закреплены — самый старый. */
function evictOldest(order: readonly string[], maxWarm: number, pinned: ReadonlySet<string>): string[] {
  const out = [...order];
  while (out.length > maxWarm) {
    const victim = out.findIndex((id) => !pinned.has(id));
    out.splice(victim === -1 ? 0 : victim, 1);
  }
  return out;
}

/**
 * Keep-alive pool: кто ушёл из live → warm; eviction LRU (не pin первым).
 * Iframe в mountedIds не unmount — state приложения сохраняется.
 */
export function reconcileWarmPool(input: WarmPoolInput): WarmPoolResult {
  const {
    liveIds,
    previousLiveIds,
    previousWarmOrder,
    pinned,
    maxWarm,
    iframeAllowed,
  } = input;

  const unlimitedWarm = maxWarm <= 0 || maxWarm >= 9999;

  const candidate = (id: string): boolean => !liveIds.has(id) && isAllowed(id, iframeAllowed);
  // Warm candidates: previous order minus live / disallowed (без повторов)
  let order = [...new Set(previousWarmOrder)].filter(candidate);
  // Только что ушли из live, затем pin (всегда в warm, если не live) → newest (конец массива)
  for (const id of [...previousLiveIds, ...pinned].filter(candidate)) {
    order = [...order.filter((x) => x !== id), id];
  }
  if (!unlimitedWarm) {
    order = evictOldest(order, maxWarm, pinned);
  }

  const warmIds = new Set(order);
  const mountedIds = new Set<string>([...liveIds, ...warmIds]);
  return { warmOrder: order, warmIds, mountedIds };
}
