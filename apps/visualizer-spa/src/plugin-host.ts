/**
 * Host VisualizerPluginApi для SPA: registry toolbar-кнопок и apply visualizer().
 *
 * Совместим по контракту с `@live-app-map/plugin-api` (структурные типы).
 * Consume в MapToolbar/App — отдельный шаг; здесь только host-side API.
 */

/**
 * Опции кнопки тулбара, регистрируемой плагином.
 */
export type ToolbarButtonOpts = {
  readonly id: string;
  readonly label: string;
  readonly onClick: () => void;
};

/**
 * Зарегистрированная кнопка (снимок для UI).
 */
export type ToolbarButtonRegistration = {
  readonly id: string;
  readonly label: string;
  readonly onClick: () => void;
};

/**
 * API visualizer-хоста для плагинов (зеркало plugin-api).
 */
export type VisualizerPluginApi = {
  readonly addToolbarButton: (opts: ToolbarButtonOpts) => void;
};

/**
 * Минимальный плагин с опциональным visualizer-хуком.
 * Структурно совместим с LiveAppMapPlugin из plugin-api.
 */
export type VisualizerHostPlugin = {
  readonly name: string;
  readonly version?: string;
  visualizer?(api: VisualizerPluginApi): void;
};

let toolbarButtons: ToolbarButtonRegistration[] = [];

/**
 * Снимок зарегистрированных toolbar-кнопок (новый массив, без мутации).
 *
 * @returns readonly-список кнопок в порядке регистрации (replace по id — на месте)
 */
export function getRegisteredToolbarButtons(): readonly ToolbarButtonRegistration[] {
  return toolbarButtons.slice();
}

/**
 * Полный сброс registry (тесты и повторная init).
 */
export function resetPluginHost(): void {
  toolbarButtons = [];
}

/**
 * Создаёт VisualizerPluginApi, пишущий в текущий module-level registry.
 *
 * @returns API с addToolbarButton
 */
export function createVisualizerPluginApi(): VisualizerPluginApi {
  return {
    addToolbarButton(opts: ToolbarButtonOpts): void {
      const id = normalizeRequiredString(opts.id, 'id');
      const label = normalizeRequiredString(opts.label, 'label');
      if (typeof opts.onClick !== 'function') {
        throw new Error('addToolbarButton: onClick обязателен');
      }
      const entry: ToolbarButtonRegistration = {
        id,
        label,
        onClick: opts.onClick,
      };
      const without = toolbarButtons.filter((b) => b.id !== id);
      toolbarButtons = [...without, entry];
    },
  };
}

/**
 * Вызывает `plugin.visualizer(api)` для каждого плагина с хуком.
 * Пустой список и плагины без visualizer — no-op (production-safe).
 *
 * @param plugins — упорядоченный список host-плагинов
 */
export function applyVisualizerPlugins(
  plugins: readonly VisualizerHostPlugin[],
): void {
  if (plugins.length === 0) {
    return;
  }
  const api = createVisualizerPluginApi();
  for (const plugin of plugins) {
    if (plugin.visualizer !== undefined) {
      plugin.visualizer(api);
    }
  }
}

/**
 * Инициализация host: сброс registry + apply плагинов.
 * Default `[]` — безопасный production no-op, boot SPA не ломается.
 *
 * @param plugins — список плагинов (по умолчанию пустой)
 */
export function initPluginHost(
  plugins: readonly VisualizerHostPlugin[] = [],
): void {
  resetPluginHost();
  applyVisualizerPlugins(plugins);
}

/**
 * Нормализует обязательную непустую строку опции кнопки.
 *
 * @param value — сырое значение
 * @param field — имя поля для сообщения об ошибке
 * @returns trim-строка
 */
function normalizeRequiredString(value: string, field: string): string {
  if (typeof value !== 'string') {
    throw new Error(`addToolbarButton: ${field} обязателен`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`addToolbarButton: ${field} обязателен`);
  }
  return trimmed;
}
