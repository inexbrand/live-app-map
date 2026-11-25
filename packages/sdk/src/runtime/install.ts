/**
 * Установка рантайма в странице и его текст для вставки в index.html.
 */
import type { LamStatePayload } from './api';
import { lamBodyOf, lamFakeResponse, lamFakeXhr, lamFetchTarget, lamFindOverride, lamMatchApiKey, lamParseStateId, lamPatchFetch, lamPatchXhr, lamStateIdFromPage } from './api';
import type { LamComponentInfo } from './components';
import { lamComponents, lamOwnFileOf, lamPlaceSource, lamRectOf, lamRootFibers } from './components';
import { advanceMapping, decodeVlq, lamBundleFrameInLibrary, lamBundleSource, lamIndexedPosition, lamIndexMap, lamIsBundleFile, lamMapFor, scanMappingRow } from './sourcemap';
import { appFrameOf, componentNameOf, debugPlaceOf, fiberOf, frameFromStack, functionComponentName } from './fiber';

/** `window.__LAM__` — что рантайм даёт визуализатору и тестам. */
export type LamPageApi = {
  /** Id состояния страницы (lam_state) или null. */
  readonly stateId: string | null;
  /** Описание состояния от плагина; без состояния или при ошибке — null. */
  readonly state: Promise<LamStatePayload | null>;
  /** Компоненты страницы сейчас. */
  readonly components: () => LamComponentInfo[];
};

/**
 * Ставит рантайм: `window.__LAM__`, и при lam_state — подмену fetch и XHR по
 * описанию из GET /@lam/state. Без lam_state сеть не трогает. Повторный вызов — ничего.
 *
 * @param param - имя параметра адреса и ключа sessionStorage (lam_state)
 */
export function lamRuntimeInstall(param: string): void {
  const w = window as unknown as Window & { readonly XMLHttpRequest: typeof XMLHttpRequest; __LAM__?: LamPageApi };
  if (w.__LAM__ !== undefined) {
    return;
  }
  let stored: string | null = null;
  try {
    stored = w.sessionStorage.getItem(param);
  } catch (e) {
    stored = null;
  }
  const id = lamStateIdFromPage(w.location.href, stored, param);
  const original = w.fetch;
  const state: Promise<LamStatePayload | null> =
    id === null
      ? Promise.resolve(null)
      : original
          .call(w, '/@lam/state?id=' + encodeURIComponent(id))
          .then((r) => (r.ok ? (r.json() as Promise<LamStatePayload>) : r.text().then((t) => {
            console.error('[live-app-map] ' + t);
            return null;
          })))
          .catch((e: unknown) => {
            console.error('[live-app-map] нет ответа /@lam/state: ' + String(e));
            return null;
          });
  w.__LAM__ = { stateId: id, state, components: () => lamComponents(w.document) };
  // Сборка для карты: карты бандлов читаем заранее — components() синхронный
  w.addEventListener('DOMContentLoaded', () => {
    const scripts = w.document.querySelectorAll('script[type="module"][src]');
    for (let i = 0; i < scripts.length; i++) {
      const src = (scripts[i] as HTMLScriptElement).src;
      if (lamIsBundleFile(new URL(src).pathname)) {
        lamMapFor(src);
      }
    }
  });
  if (id !== null) {
    lamPatchFetch(w, state, original);
    lamPatchXhr(w, state);
  }
}

/**
 * Текст рантайма для `<script>` в начале `<head>`: объявления функций и вызов установки.
 * Обычный (не модульный) скрипт выполняется сразу — до модулей приложения и их запросов.
 *
 * @param param - имя параметра состояния (LAM_STATE_PARAM)
 */
export function lamRuntimeScript(param: string): string {
  const fns: readonly ((...args: never[]) => unknown)[] = [
    functionComponentName, componentNameOf, appFrameOf, frameFromStack, fiberOf, debugPlaceOf,
    lamParseStateId, lamStateIdFromPage, lamMatchApiKey, lamFindOverride, lamBodyOf, lamFakeResponse, lamFetchTarget, lamPatchFetch, lamFakeXhr, lamPatchXhr,
    decodeVlq, advanceMapping, scanMappingRow, lamIndexMap, lamIndexedPosition, lamIsBundleFile, lamBundleSource, lamMapFor, lamBundleFrameInLibrary,
    lamPlaceSource, lamOwnFileOf, lamRectOf, lamRootFibers, lamComponents, lamRuntimeInstall,
  ];
  // __name: сборщик с keepNames вставляет его вызовы в тела функций
  return '(function(){var __name=function(f){return f;};\n' + fns.map((f) => f.toString()).join('\n') + '\ntry{lamRuntimeInstall(' + JSON.stringify(param) + ');}catch(e){console.error("[live-app-map] рантайм: "+e);}})();';
}