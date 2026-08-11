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

/**
 * Бюджет live iframe (enterprise TDD §7): multi-iframe, не «все сразу».
 * 9999 в UI = opt-in unlimited.
 */
export const DEFAULT_MAX_LIVE = 8;
/** Pin soft-cap; excess pins → deferred toast, live режет maxLive. */
export const DEFAULT_MAX_PINNED = 6;
/**
 * Keep-alive: iframe остаётся в DOM (state SPA не сбрасывается) после
 * выхода из live-бюджета. LRU, pin защищён.
 */
export const DEFAULT_MAX_WARM = 8;

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

  // Warm candidates: previous order minus live / disallowed
  let order: string[] = [];
  const seen = new Set<string>();
  for (const id of previousWarmOrder) {
    if (liveIds.has(id)) {
      continue;
    }
    if (!isAllowed(id, iframeAllowed)) {
      continue;
    }
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    order.push(id);
  }

  // Только что ушли из live → newest (конец массива)
  for (const id of previousLiveIds) {
    if (liveIds.has(id)) {
      continue;
    }
    if (!isAllowed(id, iframeAllowed)) {
      continue;
    }
    order = order.filter((x) => x !== id);
    order.push(id);
  }

  // Pin всегда в warm, если не live (newest, защищены при eviction)
  for (const id of pinned) {
    if (liveIds.has(id)) {
      continue;
    }
    if (!isAllowed(id, iframeAllowed)) {
      continue;
    }
    order = order.filter((x) => x !== id);
    order.push(id);
  }

  if (!unlimitedWarm) {
    while (order.length > maxWarm) {
      // Evict oldest non-pinned first
      let victim = -1;
      for (let i = 0; i < order.length; i++) {
        const id = order[i];
        if (id !== undefined && !pinned.has(id)) {
          victim = i;
          break;
        }
      }
      if (victim === -1) {
        // Все pin — всё равно режем oldest
        order.shift();
      } else {
        order.splice(victim, 1);
      }
    }
  }

  const warmIds = new Set(order);
  const mountedIds = new Set<string>([...liveIds, ...warmIds]);
  return { warmOrder: order, warmIds, mountedIds };
}
