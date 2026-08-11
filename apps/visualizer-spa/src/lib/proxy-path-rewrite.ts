/**
 * Rewrite absolute root paths in proxied HTML/JS/CSS so Vite/Next assets
 * load under `/__lam_proxy/<app>/…` instead of visualizer origin `/…`.
 *
 * Не трогаем self-closing `/>` и protocol-relative `//`.
 */

/**
 * Префиксует path-only URL в src/href/import/url(/…
 *
 * @param body - HTML/JS/CSS text
 * @param proxyPrefix - e.g. `/__lam_proxy/admin` (без trailing slash)
 */
export function rewriteProxiedAssetPaths(
  body: string,
  proxyPrefix: string,
): string {
  const prefix = normalizeProxyPrefix(proxyPrefix);
  if (prefix.length === 0) {
    return body;
  }

  let out = body;

  // HTML attrs: src="/x" href='/x' action="/x"
  out = out.replace(
    /(\b(?:src|href|action|poster|cite|formaction|data-src|data-href)\s*=\s*["'])\/(?!\/)(?!__lam_proxy\/)/gi,
    `$1${prefix}/`,
  );

  // CSS url(/x) url('/x')
  out = out.replace(
    /(url\(\s*['"]?)\/(?!\/)(?!__lam_proxy\/)/gi,
    `$1${prefix}/`,
  );

  // ESM: from "/x"  import "/x"
  out = out.replace(
    /((?:import|from)\s*["'])\/(?!\/)(?!__lam_proxy\/)/g,
    `$1${prefix}/`,
  );

  // dynamic import("/x")
  out = out.replace(
    /(import\s*\(\s*["'])\/(?!\/)(?!__lam_proxy\/)/g,
    `$1${prefix}/`,
  );

  // Vite inject: from "/@react-refresh"
  // already covered by import|from

  return out;
}

function normalizeProxyPrefix(proxyPrefix: string): string {
  return proxyPrefix.replace(/\/+$/, '');
}

/**
 * Inline-скрипт: same-origin `/api…` → `/__lam_proxy/<app>/api…`.
 * Без этого miniapp (VITE_API_BASE_URL="") бьёт в visualizer :4310/api → 404
 * и показывает «Внутренняя ошибка».
 *
 * @param proxyPrefix - e.g. `/__lam_proxy/miniapp`
 */
export function buildSameOriginApiShimScript(proxyPrefix: string): string {
  const prefix = normalizeProxyPrefix(proxyPrefix);
  // JSON.stringify — безопасный литерал для JS-строки
  const p = JSON.stringify(prefix);
  return (
    `<script data-lam-api-shim="1">(function(){` +
    `var P=${p};` +
    `if(!P||window.__LAM_API_SHIM__)return;window.__LAM_API_SHIM__=P;` +
    `function fix(u){` +
    `if(typeof u!=="string")return u;` +
    `if(u.indexOf("/api")===0&&u.indexOf(P+"/")!==0)return P+u;` +
    `try{var a=new URL(u,location.href);` +
    `if(a.origin===location.origin&&a.pathname.indexOf("/api")===0` +
    `&&a.pathname.indexOf(P+"/")!==0){` +
    `return P+a.pathname+a.search+a.hash;}}catch(e){}` +
    `return u;}` +
    `var of=window.fetch;` +
    `window.fetch=function(input,init){` +
    `if(typeof input==="string")return of.call(this,fix(input),init);` +
    `if(input&&typeof Request!=="undefined"&&input instanceof Request){` +
    `var nu=fix(input.url);` +
    `if(nu!==input.url)return of.call(this,new Request(nu,input),init);` +
    `}` +
    `return of.call(this,input,init);};` +
    `var XO=XMLHttpRequest.prototype.open;` +
    `XMLHttpRequest.prototype.open=function(){` +
    `var a=arguments;if(a.length>=2&&typeof a[1]==="string")a[1]=fix(a[1]);` +
    `return XO.apply(this,a);};` +
    `})();</script>`
  );
}

/**
 * Вставляет API-shim сразу после `<head…>` в HTML (если есть).
 * Идемпотентно: не дублирует при повторном rewrite.
 *
 * @param html - HTML body
 * @param proxyPrefix - path prefix proxy
 */
export function injectSameOriginApiShim(
  html: string,
  proxyPrefix: string,
): string {
  const prefix = normalizeProxyPrefix(proxyPrefix);
  if (prefix.length === 0) {
    return html;
  }
  if (html.includes('data-lam-api-shim="1"') || html.includes('data-lam-api-shim=\'1\'')) {
    return html;
  }
  const shim = buildSameOriginApiShimScript(prefix);
  const headOpen = html.match(/<head[^>]*>/i);
  if (headOpen && headOpen.index !== undefined) {
    const i = headOpen.index + headOpen[0].length;
    return html.slice(0, i) + shim + html.slice(i);
  }
  // fallback: before first script
  const script = html.match(/<script/i);
  if (script && script.index !== undefined) {
    return html.slice(0, script.index) + shim + html.slice(script.index);
  }
  return shim + html;
}

/**
 * Content-Type, для которых безопасен text rewrite.
 */
export function shouldRewriteProxiedBody(
  contentType: string | undefined,
): boolean {
  if (!contentType) {
    return false;
  }
  const ct = contentType.toLowerCase();
  return (
    ct.includes('text/html') ||
    ct.includes('javascript') ||
    ct.includes('ecmascript') ||
    ct.includes('text/css') ||
    ct.includes('application/json') ||
    ct.includes('text/plain')
  );
}
