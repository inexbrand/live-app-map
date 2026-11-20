/**
 * Ноды карты для сервисов из раздела code.
 */
import type { AppMapNode, CodeModel } from '@live-app-map/schema';

/**
 * Нода `service` на каждый сервис: без iframe, с числом роутов, таблиц и символов.
 *
 * @param code - раздел code
 * @returns ноды сервисов
 */
export function codeServiceNodes(code: CodeModel): AppMapNode[] {
  return code.services.map((s) => ({
    id: s.id,
    kind: 'service',
    title: s.name,
    pathPattern: s.root,
    source: { file: s.root },
    iframePolicy: { enabled: false, reason: 'сервис бэкенда — без живого превью' },
    metadata: {
      routes: code.routes.filter((r) => r.serviceId === s.id).length,
      tables: code.tables.filter((t) => t.serviceId === s.id).length,
      symbols: code.symbols.filter((x) => x.serviceId === s.id).length,
    },
  }));
}
