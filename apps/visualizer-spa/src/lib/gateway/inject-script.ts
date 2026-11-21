/**
 * Скрипт, который шлюз ставит первым в <head> HTML-страниц приложения:
 * 1) кладёт значения sessionStorage профиля до загрузки приложения;
 * 2) сообщает визуализатору (postMessage родителю) высоту страницы и адрес;
 * 3) считает ответы API 401/403 — признак «не авторизован».
 */

/** Сообщение страницы визуализатору. */
export type LamPageMessage = {
  readonly lam: 'page';
  readonly href: string;
  /**
   * Высота контента: коробки html/body (не scrollHeight документа — тот не
   * меньше окна iframe) плюс то, что спрятано во внутреннем прокручиваемом
   * контейнере (SPA часто прокручивают не body, а свой div); и высота окна
   * iframe, px.
   */
  readonly contentHeight: number;
  readonly viewportHeight: number;
  /** Ответов API 401/403 с загрузки страницы. */
  readonly authFailures: number;
  /** Последний такой ответ: статус и путь. */
  readonly lastAuthFailure?: string;
  /** Профиль сессии шлюза. */
  readonly profile: string;
  /** У профиля есть куки или storage для этого приложения. */
  readonly hasSession: boolean;
};

/**
 * Проверяет, что сообщение — от скрипта шлюза.
 *
 * @param data - data из MessageEvent
 */
export function isLamPageMessage(data: unknown): data is LamPageMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    'lam' in data &&
    data.lam === 'page' &&
    'contentHeight' in data &&
    typeof data.contentHeight === 'number' &&
    'viewportHeight' in data &&
    typeof data.viewportHeight === 'number'
  );
}

/**
 * Текст скрипта.
 *
 * @param storage - значения sessionStorage
 * @param profile - id профиля
 * @param hasSession - у профиля есть данные для этого приложения
 */
export function injectScript(storage: Readonly<Record<string, string>>, profile: string, hasSession: boolean): string {
  // JSON внутри <script>: «</» экранируем, чтобы значение не закрыло тег.
  const json = (v: unknown): string => JSON.stringify(v).replace(/<\//g, '<\\/');
  return `<script data-lam-gateway>(function(){
var S=${json(storage)};try{for(var k in S){sessionStorage.setItem(k,S[k]);}}catch(e){}
var P=${json(profile)},H=${hasSession ? 'true' : 'false'},fails=0,last;
function contentH(){var d=document.documentElement,b=document.body,h=Math.max(d.offsetHeight,b?b.scrollHeight:0,b?b.offsetHeight:0),x=0,all=b?b.getElementsByTagName('*'):[];
for(var i=0;i<all.length&&i<5000;i++){var e=all[i];if(e.scrollHeight>e.clientHeight+8&&e.clientHeight>0){var o=getComputedStyle(e).overflowY;if(o==='auto'||o==='scroll'){x=Math.max(x,e.scrollHeight-e.clientHeight);}}}return Math.ceil(h+x);}
function post(){try{parent.postMessage({lam:'page',href:location.href,contentHeight:contentH(),viewportHeight:innerHeight,authFailures:fails,lastAuthFailure:last,profile:P,hasSession:H},'*');}catch(e){}}
var t;function soon(){clearTimeout(t);t=setTimeout(post,120);}
function note(s,u){if(s===401||s===403){fails++;last=s+' '+String(u).replace(location.origin,'').slice(0,120);soon();}}
var f=window.fetch;if(f){window.fetch=function(i,o){return f.apply(this,arguments).then(function(r){note(r.status,r.url);return r;});};}
var X=XMLHttpRequest.prototype,op=X.open,sd=X.send;X.open=function(m,u){this.__lamU=u;return op.apply(this,arguments);};
X.send=function(){var x=this;x.addEventListener('loadend',function(){note(x.status,x.__lamU);});return sd.apply(this,arguments);};
var ps=history.pushState,rs=history.replaceState;history.pushState=function(){var r=ps.apply(this,arguments);soon();return r;};history.replaceState=function(){var r=rs.apply(this,arguments);soon();return r;};
addEventListener('popstate',soon);addEventListener('hashchange',soon);addEventListener('load',post);addEventListener('message',function(e){if(e.data&&e.data.lam==='ping')post();});
function watch(){if(!document.body){return setTimeout(watch,50);}try{new ResizeObserver(soon).observe(document.body);new MutationObserver(soon).observe(document.body,{childList:true,subtree:true});}catch(e){setInterval(post,1000);}post();}watch();
})();</script>`;
}

/**
 * Вставляет скрипт в начало <head> (или в начало документа).
 *
 * @param html - HTML страницы
 * @param script - тег <script>
 */
export function injectIntoHtml(html: string, script: string): string {
  const head = /<head[^>]*>/i.exec(html);
  if (head !== null) {
    const at = head.index + head[0].length;
    return `${html.slice(0, at)}${script}${html.slice(at)}`;
  }
  return `${script}${html}`;
}
