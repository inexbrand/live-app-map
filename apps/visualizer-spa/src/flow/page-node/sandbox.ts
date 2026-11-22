/**
 * Sandbox iframe ноды и подпись-заглушка вместо живого экрана.
 */

export type IframeSandboxPreset = 'strict' | 'trusted';

export const SANDBOX_TRUSTED =
  'allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads';

export const SANDBOX_STRICT =
  'allow-scripts allow-forms allow-popups allow-modals';

export function isTrustedIframeBaseUrl(baseUrl: string | null | undefined): boolean {
  const trimmed = baseUrl?.trim() ?? '';
  if (trimmed === '') {
    return false;
  }
  // Same-origin Vite TLS proxy (self-signed target, secure:false)
  if (TRUSTED_PROXY_PATHS.some((p) => trimmed.includes(p))) {
    return true;
  }
  try {
    return isLocalHostname(new URL(trimmed, typeof location !== 'undefined' ? location.href : 'http://localhost').hostname.toLowerCase());
  } catch {
    return false;
  }
}

const TRUSTED_PROXY_PATHS = ['/__lam_proxy/miniapp', '/__lam_proxy/admin', '/__lam_proxy/site', '/__lam_proxy/https/'];

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

function isLocalHostname(host: string): boolean {
  return LOCAL_HOSTS.has(host) || host.endsWith('.localhost');
}

export function resolveIframeSandboxPreset(
  baseUrl: string | null | undefined,
  override?: IframeSandboxPreset | null,
): IframeSandboxPreset {
  if (override === 'strict' || override === 'trusted') {
    return override;
  }
  return isTrustedIframeBaseUrl(baseUrl) ? 'trusted' : 'strict';
}

export function sandboxAttrForPreset(preset: IframeSandboxPreset): string {
  return preset === 'trusted' ? SANDBOX_TRUSTED : SANDBOX_STRICT;
}

export function resolvePagePlaceholder(args: {
  readonly mode: 'live' | 'map-only' | 'compact';
  readonly hasUrl: boolean;
  readonly iframeError: boolean;
  /** Нода в viewport, но не в live-бюджете */
  readonly inViewport?: boolean;
  readonly isPinned?: boolean;
  /** Keep-alive: iframe в DOM, state сохранён */
  readonly isWarm?: boolean;
}): string {
  if (args.iframeError) {
    return 'Ошибка загрузки iframe';
  }
  if (args.mode === 'live') {
    if (!args.hasUrl) {
      return 'Нет URL';
    }
    if (args.isWarm) {
      return 'В памяти (заморожен, без перезагрузки)';
    }
    if (args.isPinned) {
      return 'Pin в очереди (бюджет iframe)';
    }
    if (args.inViewport) {
      return 'В кадре · ждёт слот (бюджет iframe)';
    }
    return 'Вне кадра · live при приближении';
  }
  if (args.mode === 'compact') {
    return 'Компакт';
  }
  return 'Только карта';
}

export function sandboxPresetLabel(preset: IframeSandboxPreset): string {
  if (preset === 'trusted') {
    return 'Sandbox trusted (localhost)';
  }
  return 'Sandbox strict';
}