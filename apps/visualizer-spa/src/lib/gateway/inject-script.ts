import { pickerScriptText } from './pick-script';

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

/** Состояние входа страницы: сколько 401/403 без последующего успеха. */
export type AuthState = { readonly fails: number; readonly last?: string };

/**
 * Следующее состояние входа после ответа API. 401/403 — сбой; успешный
 * JSON-ответ после сбоя — приложение восстановило вход само (обновило
 * токен через refresh), сбои сбрасываются. Функция встраивается в скрипт
 * страницы как текст — без замыканий и импортов.
 *
 * @param s - текущее состояние
 * @param status - HTTP-статус
 * @param path - путь запроса
 * @param json - ответ в JSON
 */
export function nextAuthState(s: AuthState, status: number, path: string, json: boolean): AuthState {
  if (status === 401 || status === 403) {
    return { fails: s.fails + 1, last: `${status} ${path.slice(0, 120)}` };
  }
  if (s.fails > 0 && status >= 200 && status < 300 && json) {
    return { fails: 0 };
  }
  return s;
}

/** Колесо над экраном в ноде: визуализатор пересылает его странице. */
export type LamWheelMessage = {
  readonly lam: 'wheel';
  /** Точка под курсором в координатах страницы, px. */
  readonly x: number;
  readonly y: number;
  readonly dx: number;
  readonly dy: number;
};

/**
 * Прокручивает страницу колесом в точке: ближайший к точке контейнер,
 * который ещё может прокрутиться в эту сторону (SPA часто прокручивают
 * свой div, а не body), иначе сам документ. Встраивается в скрипт
 * страницы как текст — без замыканий и импортов.
 *
 * @param x - точка по горизонтали, px страницы
 * @param y - точка по вертикали, px страницы
 * @param dx - сдвиг по горизонтали, px
 * @param dy - сдвиг по вертикали, px
 * @returns true — что-то прокрутилось
 */
export function wheelScroll(x: number, y: number, dx: number, dy: number): boolean {
  const can = (d: number, pos: number, size: number, view: number, overflow: string): boolean =>
    d !== 0 && (overflow === 'auto' || overflow === 'scroll') && (d > 0 ? pos + view < size - 1 : pos > 0);
  for (let el = document.elementFromPoint(x, y); el !== null; el = el.parentElement) {
    const st = getComputedStyle(el);
    const sx = can(dx, el.scrollLeft, el.scrollWidth, el.clientWidth, st.overflowX);
    const sy = can(dy, el.scrollTop, el.scrollHeight, el.clientHeight, st.overflowY);
    if (sx || sy) {
      el.scrollBy(sx ? dx : 0, sy ? dy : 0);
      return true;
    }
  }
  const root = document.scrollingElement;
  if (root === null) {
    return false;
  }
  const top = root.scrollTop;
  const left = root.scrollLeft;
  root.scrollBy(dx, dy);
  return root.scrollTop !== top || root.scrollLeft !== left;
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
var P=${json(profile)},H=${hasSession ? 'true' : 'false'},A={fails:0},next=${nextAuthState.toString()},wheel=${wheelScroll.toString()};
function contentH(){var d=document.documentElement,b=document.body,h=Math.max(d.offsetHeight,b?b.scrollHeight:0,b?b.offsetHeight:0),x=0,all=b?b.getElementsByTagName('*'):[];
for(var i=0;i<all.length&&i<5000;i++){var e=all[i];if(e.scrollHeight>e.clientHeight+8&&e.clientHeight>0){var o=getComputedStyle(e).overflowY;if(o==='auto'||o==='scroll'){x=Math.max(x,e.scrollHeight-e.clientHeight);}}}return Math.ceil(h+x);}
function post(){try{var ch=contentH();if(ch===0)return;parent.postMessage({lam:'page',href:location.href,contentHeight:ch,viewportHeight:innerHeight,authFailures:A.fails,lastAuthFailure:A.last,profile:P,hasSession:H},'*');}catch(e){}}
var t;function soon(){clearTimeout(t);t=setTimeout(post,120);}
function note(s,u,ct){var b=A;A=next(A,s,String(u).replace(location.origin,''),/json/i.test(ct||''));if(A!==b)soon();}
var f=window.fetch;if(f){window.fetch=function(i,o){return f.apply(this,arguments).then(function(r){note(r.status,r.url,r.headers.get('content-type'));return r;});};}
var X=XMLHttpRequest.prototype,op=X.open,sd=X.send;X.open=function(m,u){this.__lamU=u;return op.apply(this,arguments);};
X.send=function(){var x=this;x.addEventListener('loadend',function(){note(x.status,x.__lamU,x.getResponseHeader('content-type'));});return sd.apply(this,arguments);};
var ps=history.pushState,rs=history.replaceState;history.pushState=function(){var r=ps.apply(this,arguments);soon();return r;};history.replaceState=function(){var r=rs.apply(this,arguments);soon();return r;};
addEventListener('popstate',soon);addEventListener('hashchange',soon);addEventListener('load',post);addEventListener('message',function(e){var d=e.data;if(!d||e.source!==parent)return;if(d.lam==='ping')post();if(d.lam==='wheel')wheel(+d.x,+d.y,+d.dx,+d.dy);});
${pickerScriptText()}
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
