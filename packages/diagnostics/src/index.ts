/**
 * Каталог diagnostic codes + форматтеры для CLI/UI.
 */
import type { Diagnostic, DiagnosticSeverity } from '@live-app-map/schema';

export type DiagnosticCode =
  | 'AMBIGUOUS_APP_DIR'
  | 'HYBRID_ROUTER'
  | 'MISSING_EXAMPLE_PARAM'
  | 'UNRESOLVED_TARGET'
  | 'DYNAMIC_HREF'
  | 'EDGE_SCAN_TRUNCATED'
  | 'PARALLEL_LIVE_LIMITATION'
  | 'PIN_DEFERRED'
  | 'NO_APP_DIR'
  | 'NO_ROUTES_FOUND'
  | 'INVALID_BASE_URL'
  | 'FRAMEWORK_AUTO_DETECT'
  | 'DANGLING_EDGE'
  | 'DUPLICATE_NODE_ID'
  | 'SCAN_OK';

const CATALOG: Record<
  DiagnosticCode,
  { severity: DiagnosticSeverity; title: string; hint: string }
> = {
  AMBIGUOUS_APP_DIR: {
    severity: 'warning',
    title: 'Несколько app-директорий',
    hint: 'Укажите appRoot явно в конфиге',
  },
  HYBRID_ROUTER: {
    severity: 'info',
    title: 'Гибрид app + pages router',
    hint: 'Оба дерева будут в одном графе',
  },
  MISSING_EXAMPLE_PARAM: {
    severity: 'warning',
    title: 'Нет example param для dynamic route',
    hint: 'Задайте exampleParams в live-app-map.config',
  },
  UNRESOLVED_TARGET: {
    severity: 'warning',
    title: 'Не удалось сопоставить href с route',
    hint: 'Проверьте литерал или добавьте plugin extractor',
  },
  DYNAMIC_HREF: {
    severity: 'info',
    title: 'Динамический href',
    hint: 'Включите includeLowConfidence при необходимости',
  },
  EDGE_SCAN_TRUNCATED: {
    severity: 'warning',
    title: 'Edge scan обрезан по лимиту файлов',
    hint: 'Увеличьте edge.maxFiles или сузьте include',
  },
  PARALLEL_LIVE_LIMITATION: {
    severity: 'info',
    title: 'Parallel route: live iframe = жёсткая навигация',
    hint: 'Модальный intercept soft-nav не эмулируется',
  },
  PIN_DEFERRED: {
    severity: 'info',
    title: 'Pin отложен из-за бюджета iframe',
    hint: 'Открепите другие или увеличьте maxLiveIframes',
  },
  NO_APP_DIR: {
    severity: 'error',
    title: 'Не найден app/ или pages/',
    hint: 'Проверьте --dir и framework',
  },
  NO_ROUTES_FOUND: {
    severity: 'error',
    title: 'Маршруты не найдены',
    hint: 'Проверьте структуру проекта и ignore-паттерны',
  },
  INVALID_BASE_URL: {
    severity: 'warning',
    title: 'Некорректный baseUrl',
    hint: 'Ожидается http(s)://…',
  },
  FRAMEWORK_AUTO_DETECT: {
    severity: 'info',
    title: 'Framework определён автоматически',
    hint: 'Можно зафиксировать framework в конфиге',
  },
  DANGLING_EDGE: {
    severity: 'warning',
    title: 'Ребро на несуществующую ноду',
    hint: 'Ребро будет отброшено при normalize',
  },
  DUPLICATE_NODE_ID: {
    severity: 'warning',
    title: 'Дубликат id ноды',
    hint: 'Стабильные id должны быть уникальны',
  },
  SCAN_OK: {
    severity: 'info',
    title: 'Скан завершён',
    hint: 'Действий не требуется',
  },
};

/** Русские подписи severity для CLI/UI. */
const SEVERITY_LABEL_RU: Record<DiagnosticSeverity, string> = {
  error: 'ошибка',
  warning: 'предупреждение',
  info: 'инфо',
};

/**
 * Создаёт diagnostic с текстом из каталога.
 */
export function diag(
  code: DiagnosticCode,
  overrides?: Partial<Pick<Diagnostic, 'message' | 'path' | 'file' | 'severity' | 'hint'>>,
): Diagnostic {
  const meta = CATALOG[code];
  return {
    code,
    severity: overrides?.severity ?? meta.severity,
    message: overrides?.message ?? meta.title,
    path: overrides?.path,
    file: overrides?.file,
    hint: overrides?.hint ?? meta.hint,
  };
}

/**
 * Форматирует diagnostic для CLI (одна строка, human-readable RU).
 * Включает severity (RU), code, path/file и message.
 */
export function formatDiagnostic(d: Diagnostic): string {
  const loc = d.file ? ` ${d.file}` : d.path ? ` ${d.path}` : '';
  const severityRu = SEVERITY_LABEL_RU[d.severity];
  return `[${severityRu}] ${d.code}${loc}: ${d.message}`;
}

/**
 * Сортировка: error → warning → info, затем code.
 */
export function sortDiagnostics(list: readonly Diagnostic[]): Diagnostic[] {
  const rank: Record<DiagnosticSeverity, number> = {
    error: 0,
    warning: 1,
    info: 2,
  };
  return [...list].sort((a, b) => {
    const s = rank[a.severity] - rank[b.severity];
    if (s !== 0) {
      return s;
    }
    return a.code.localeCompare(b.code);
  });
}

export function getCatalog(): typeof CATALOG {
  return CATALOG;
}
