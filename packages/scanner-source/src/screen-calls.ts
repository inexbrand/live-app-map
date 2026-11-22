/**
 * Вызовы API, достижимые из экрана: по вызовам функций, JSX-компонентам,
 * ссылкам на функции и сторам (`const useStore = create(…)`).
 */
import ts from 'typescript';
import type { ScreenApiCall } from '@live-app-map/schema';
import { functionOfDeclaration } from './api-value';
import { ownerInterface, type ImplementationIndex } from './implementations';
import { isProjectNode, resolvedSymbol, type SourceContext } from './source-context';

/** Глубина: экран → секция → виджет → хук → стор → обёртка … */
const MAX_DEPTH = 8;

/** Имя в собственном объявлении (`function A`, `const a`) — не ссылка. */
function isDeclarationName(id: ts.Identifier): boolean {
  const p = id.parent;
  return (
    (ts.isFunctionDeclaration(p) ||
      ts.isVariableDeclaration(p) ||
      ts.isClassDeclaration(p) ||
      ts.isMethodDeclaration(p) ||
      ts.isPropertyAssignment(p) ||
      ts.isParameter(p)) &&
    p.name === id
  );
}

/** Два абсолютных пути файлов принадлежат одному сервису. */
export type SameService = (a: string, b: string) => boolean;

/** Метод → тела реализаций по всем интерфейсам (кэш на индекс реализаций). */
const methodIndexCache = new WeakMap<ImplementationIndex, Map<string, { ifaces: number; bodies: ts.Node[] }>>();

/**
 * Реализации метода по имени, когда тип получателя не известен
 * (`useMemo(() => createApi(client))` без типов React): только если имя есть
 * не больше чем у двух интерфейсов — иначе это не отличить от случайного совпадения.
 */
function methodByName(ctx: SourceContext, id: ts.Identifier, sameService: SameService): ts.Node[] {
  if (!ts.isPropertyAccessExpression(id.parent) || id.parent.name !== id) {
    return [];
  }
  let index = methodIndexCache.get(ctx.implementations);
  if (index === undefined) {
    index = new Map();
    for (const methods of ctx.implementations.values()) {
      for (const [name, bodies] of methods) {
        const prev = index.get(name) ?? { ifaces: 0, bodies: [] };
        index.set(name, { ifaces: prev.ifaces + 1, bodies: [...prev.bodies, ...bodies] });
      }
    }
    methodIndexCache.set(ctx.implementations, index);
  }
  const found = index.get(id.text);
  const here = id.getSourceFile().fileName;
  return found !== undefined && found.ifaces <= 2 ? found.bodies.filter((b) => sameService(here, b.getSourceFile().fileName)) : [];
}

/** Сколько функций в объекте, который возвращает функция: фабрика клиента — 2 и больше. */
function returnedMethods(fn: ts.Node): number {
  let count = 0;
  const visit = (n: ts.Node): void => {
    if (ts.isFunctionLike(n) && n !== fn) {
      return;
    }
    if (ts.isReturnStatement(n) && n.expression !== undefined && ts.isObjectLiteralExpression(n.expression)) {
      count = Math.max(count, n.expression.properties.filter((p) => ts.isMethodDeclaration(p) || ts.isShorthandPropertyAssignment(p) || (ts.isPropertyAssignment(p) && ts.isFunctionLike(p.initializer))).length);
    }
    ts.forEachChild(n, visit);
  };
  ts.forEachChild(fn, visit);
  return count;
}

/** Куда ведёт ссылка: узлы для обхода и фабрика клиента, которую целиком не обходим сразу. */
type Targets = {
  readonly nodes: readonly ts.Node[];
  readonly factory?: ts.Node;
  /** Реализации метода по имени (тип получателя не виден): берутся, только если их фабрику экран вызвал. */
  readonly byName?: readonly ts.Node[];
};

/**
 * Куда ведёт ссылка: тело функции, реализации метода интерфейса или инициализатор стора.
 * Фабрики (`return { load, save, … }`) сразу не обходятся: если фабрика общая для многих
 * экранов, экрану достаются только методы, к которым он обращается; своя фабрика экрана
 * (стор страницы) обходится целиком — см. {@link screensApiCalls}.
 */
function targetsOf(ctx: SourceContext, id: ts.Identifier, sameService: SameService): Targets {
  const sym = resolvedSymbol(ctx.checker, id);
  const decl = sym?.valueDeclaration ?? sym?.declarations?.[0];
  if (decl === undefined) {
    return { nodes: [], byName: methodByName(ctx, id, sameService) };
  }
  return isProjectNode(ctx, decl) ? projectTargets(ctx, decl, id) : { nodes: [] };
}

/** Цели объявления проекта: функция (фабрика — отдельно), стор `create(…)`, реализации метода. */
function projectTargets(ctx: SourceContext, decl: ts.Declaration, id: ts.Identifier): Targets {
  const fn = functionOfDeclaration(decl);
  if (fn !== undefined) {
    return returnedMethods(fn) >= 2 ? { nodes: [], factory: fn } : { nodes: [fn] };
  }
  if (ts.isVariableDeclaration(decl) && decl.initializer !== undefined && ts.isCallExpression(decl.initializer)) {
    return { nodes: [decl.initializer] };
  }
  const iface = ownerInterface(decl);
  const impls = iface === undefined ? undefined : ctx.implementations.get(iface)?.get(id.text);
  return { nodes: [...(impls ?? [])] };
}

/** Экран для обхода. */
export type ScreenWalk = {
  /** Откуда начинается экран: файл экрана, узлы объекта роута, ветка switch. */
  readonly roots: readonly ts.Node[];
  /** Файлы других экранов: туда обход по ссылкам не заходит. */
  readonly skipFiles: ReadonlySet<string>;
  /** Сервис экрана: порог «общей» фабрики считается по экранам сервиса. */
  readonly serviceId: string;
};

/** Фабрика, найденная на пути: узел, через что найдена, глубина. */
type FactoryHit = { readonly via: string; readonly depth: number };

/** Состояние обхода одного экрана. */
type WalkState = {
  readonly out: Map<string, ScreenApiCall>;
  readonly visited: Set<ts.Node>;
  readonly factories: Map<ts.Node, FactoryHit>;
  /** Методы по имени, отложенные до того, как известны фабрики экрана. */
  readonly byName: { readonly body: ts.Node; readonly hit: FactoryHit }[];
};

/** Функция, которая возвращает объект с этим методом (`return { load() {…} }`). */
function factoryOf(body: ts.Node): ts.Node | undefined {
  let n: ts.Node | undefined = body.parent;
  let sawObject = false;
  while (n !== undefined && !ts.isSourceFile(n)) {
    if (ts.isObjectLiteralExpression(n)) {
      sawObject = true;
    } else if (sawObject && ts.isFunctionLike(n)) {
      return n;
    }
    n = n.parent;
  }
  return undefined;
}

type Walk = (node: ts.Node, via: string | undefined, depth: number) => void;
type OnHit = (node: ts.Node, hit: FactoryHit) => void;

/** Обход одного экрана: вызовы API узлов и переходы по ссылкам; фабрики и методы по имени — наружу. */
class ScreenWalker {
  constructor(
    private readonly ctx: SourceContext,
    private readonly screen: ScreenWalk,
    private readonly callIds: ReadonlyMap<ts.Node, readonly string[]>,
    private readonly sameService: SameService,
    private readonly st: WalkState,
    private readonly onFactory: OnHit,
    private readonly onByName: OnHit,
  ) {}

  walk(node: ts.Node, via: string | undefined, depth: number): void {
    this.record(node, via);
    if (ts.isIdentifier(node) && depth < MAX_DEPTH && !isDeclarationName(node)) {
      this.follow(node, via ?? node.text, depth + 1);
    }
    ts.forEachChild(node, (child) => this.walk(child, via, depth));
  }

  /** Вызовы API этого узла (первый найденный путь к вызову сохраняется). */
  private record(node: ts.Node, via: string | undefined): void {
    for (const id of this.callIds.get(node) ?? []) {
      if (!this.st.out.has(id)) {
        this.st.out.set(id, via === undefined ? { callId: id } : { callId: id, via });
      }
    }
  }

  /** Переход по ссылке: цели обходятся (каждая раз), фабрика и методы по имени — наружу. */
  private follow(node: ts.Identifier, via: string, depth: number): void {
    const found = targetsOf(this.ctx, node, this.sameService);
    for (const target of found.nodes) {
      if (this.allowed(target) && !this.st.visited.has(target)) {
        this.st.visited.add(target);
        this.walk(target, via, depth);
      }
    }
    if (found.factory !== undefined && this.allowed(found.factory)) {
      this.onFactory(found.factory, { via, depth });
    }
    for (const body of (found.byName ?? []).filter((b) => this.allowed(b))) {
      this.onByName(body, { via, depth });
    }
  }

  /** Узел не в файле другого экрана. */
  private allowed(n: ts.Node): boolean {
    return !this.screen.skipFiles.has(n.getSourceFile().fileName);
  }
}

/**
 * Обходит узел экрана; фабрики отдаёт `onFactory`.
 */
function walkScreen(
  ctx: SourceContext,
  screen: ScreenWalk,
  callIds: ReadonlyMap<ts.Node, readonly string[]>,
  sameService: SameService,
  st: WalkState,
  onFactory: OnHit,
  onByName: OnHit,
): Walk {
  const walker = new ScreenWalker(ctx, screen, callIds, sameService, st, onFactory, onByName);
  return (node, via, depth) => walker.walk(node, via, depth);
}

/** Фабрика в первый раз — запомнить, где найдена. */
function rememberFactory(st: WalkState, fn: ts.Node, hit: FactoryHit): void {
  if (!st.factories.has(fn)) {
    st.factories.set(fn, hit);
  }
}

/** Окружение обхода экранов. */
type ScreenScan = {
  readonly ctx: SourceContext;
  readonly callIds: ReadonlyMap<ts.Node, readonly string[]>;
  readonly sameService: SameService;
};

/**
 * Второй проход экрана: обходит свои фабрики (их вызывают не больше limit экранов)
 * и методы по имени из фабрик, которые экран вызвал сам или которые внедрены.
 */
class OwnFactoryPass {
  private readonly walk: Walk;

  constructor(
    scan: ScreenScan,
    screen: ScreenWalk,
    private readonly st: WalkState,
    private readonly reach: ReadonlyMap<ts.Node, number>,
    private readonly limit: number,
  ) {
    this.walk = walkScreen(scan.ctx, screen, scan.callIds, scan.sameService, st, (fn, hit) => this.onFactory(fn, hit), (body, hit) => this.byName(body, hit));
  }

  run(): void {
    for (const [fn, hit] of [...this.st.factories]) {
      if (this.own(fn)) {
        this.enter(fn, hit);
      }
    }
    for (const { body, hit } of this.st.byName.splice(0)) {
      this.byName(body, hit);
    }
  }

  private own(fn: ts.Node): boolean {
    return (this.reach.get(fn) ?? 0) <= this.limit;
  }

  private enter(n: ts.Node, hit: FactoryHit): void {
    if (!this.st.visited.has(n)) {
      this.st.visited.add(n);
      this.walk(n, hit.via, hit.depth);
    }
  }

  private onFactory(fn: ts.Node, hit: FactoryHit): void {
    rememberFactory(this.st, fn, hit);
    if (this.own(fn)) {
      this.enter(fn, hit);
    }
  }

  /**
   * Метод по имени — из фабрики, которую экран вызвал сам, или из внедрённой:
   * её не вызывает ни один экран (создаёт оболочка, экран берёт из контекста).
   * Чужой стор (его фабрику вызывают другие экраны) не берётся.
   */
  private byName(body: ts.Node, hit: FactoryHit): void {
    const fn = factoryOf(body);
    if (fn === undefined || this.st.factories.has(fn) || !this.reach.has(fn)) {
      this.enter(body, hit);
    }
  }
}

function newWalkState(): WalkState {
  return { out: new Map(), visited: new Set(), factories: new Map(), byName: [] };
}

/** Сколько экранов вызывает каждую фабрику. */
function factoryReach(states: readonly WalkState[]): Map<ts.Node, number> {
  const reach = new Map<ts.Node, number>();
  for (const fn of states.flatMap((st) => [...st.factories.keys()])) {
    reach.set(fn, (reach.get(fn) ?? 0) + 1);
  }
  return reach;
}

/** Число экранов в каждом сервисе. */
function screensPerService(screens: readonly ScreenWalk[]): Map<string, number> {
  const perService = new Map<string, number>();
  for (const s of screens) {
    perService.set(s.serviceId, (perService.get(s.serviceId) ?? 0) + 1);
  }
  return perService;
}

/**
 * Вызовы API экранов: по вызовам функций, JSX, ссылкам и сторам.
 *
 * Два прохода. Первый собирает вызовы и фабрики (`createXStore(api)` → объект методов),
 * второй обходит целиком фабрики, которые достались не больше чем четверти экранов
 * сервиса (не меньше двух): это стор страницы, его методы зовутся через
 * переменную без видимого типа (`useMemo` без типов React). Общий клиент API
 * (фабрика многих экранов) целиком не обходится — экрану остаются его методы.
 *
 * @param ctx - контекст
 * @param screens - экраны: корни, чужие файлы, сервис
 * @param callIds - узел вызова → id найденных вызовов API
 * @param sameService - два абсолютных файла в одном сервисе
 * @returns вызовы каждого экрана в порядке screens
 */
export function screensApiCalls(
  ctx: SourceContext,
  screens: readonly ScreenWalk[],
  callIds: ReadonlyMap<ts.Node, readonly string[]>,
  sameService: SameService,
): ScreenApiCall[][] {
  const walks = screens.map((screen) => ({ screen, st: newWalkState() }));
  for (const { screen, st } of walks) {
    const walk = walkScreen(ctx, screen, callIds, sameService, st, (fn, hit) => rememberFactory(st, fn, hit), (body, hit) => st.byName.push({ body, hit }));
    for (const root of screen.roots) {
      walk(root, undefined, 0);
    }
  }
  const reach = factoryReach(walks.map((w) => w.st));
  const perService = screensPerService(screens);
  for (const { screen, st } of walks) {
    const limit = Math.max(2, Math.floor((perService.get(screen.serviceId) ?? 0) / 4));
    new OwnFactoryPass({ ctx, callIds, sameService }, screen, st, reach, limit).run();
  }
  return walks.map(({ st }) => [...st.out.values()]);
}
