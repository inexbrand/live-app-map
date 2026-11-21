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
  if (!isProjectNode(ctx, decl)) {
    return { nodes: [] };
  }
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

/**
 * Обходит узел экрана; фабрики отдаёт `onFactory`.
 */
function walkScreen(
  ctx: SourceContext,
  screen: ScreenWalk,
  callIds: ReadonlyMap<ts.Node, readonly string[]>,
  sameService: SameService,
  st: WalkState,
  onFactory: (fn: ts.Node, hit: FactoryHit) => void,
  onByName: (body: ts.Node, hit: FactoryHit) => void,
): (node: ts.Node, via: string | undefined, depth: number) => void {
  const walk = (node: ts.Node, via: string | undefined, depth: number): void => {
    for (const id of callIds.get(node) ?? []) {
      if (!st.out.has(id)) {
        st.out.set(id, via === undefined ? { callId: id } : { callId: id, via });
      }
    }
    if (ts.isIdentifier(node) && depth < MAX_DEPTH && !isDeclarationName(node)) {
      const found = targetsOf(ctx, node, sameService);
      for (const target of found.nodes) {
        if (!screen.skipFiles.has(target.getSourceFile().fileName) && !st.visited.has(target)) {
          st.visited.add(target);
          walk(target, via ?? node.text, depth + 1);
        }
      }
      if (found.factory !== undefined && !screen.skipFiles.has(found.factory.getSourceFile().fileName)) {
        onFactory(found.factory, { via: via ?? node.text, depth: depth + 1 });
      }
      for (const body of found.byName ?? []) {
        if (!screen.skipFiles.has(body.getSourceFile().fileName)) {
          onByName(body, { via: via ?? node.text, depth: depth + 1 });
        }
      }
    }
    ts.forEachChild(node, (child) => walk(child, via, depth));
  };
  return walk;
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
  const states = screens.map((): WalkState => ({ out: new Map(), visited: new Set(), factories: new Map(), byName: [] }));
  screens.forEach((screen, i) => {
    const st = states[i];
    if (st === undefined) {
      return;
    }
    const walk = walkScreen(
      ctx,
      screen,
      callIds,
      sameService,
      st,
      (fn, hit) => {
        if (!st.factories.has(fn)) {
          st.factories.set(fn, hit);
        }
      },
      (body, hit) => st.byName.push({ body, hit }),
    );
    for (const root of screen.roots) {
      walk(root, undefined, 0);
    }
  });
  const reach = new Map<ts.Node, number>();
  for (const st of states) {
    for (const fn of st.factories.keys()) {
      reach.set(fn, (reach.get(fn) ?? 0) + 1);
    }
  }
  const perService = new Map<string, number>();
  for (const s of screens) {
    perService.set(s.serviceId, (perService.get(s.serviceId) ?? 0) + 1);
  }
  screens.forEach((screen, i) => {
    const st = states[i];
    if (st === undefined) {
      return;
    }
    const limit = Math.max(2, Math.floor((perService.get(screen.serviceId) ?? 0) / 4));
    const own = (fn: ts.Node): boolean => (reach.get(fn) ?? 0) <= limit;
    const enter = (n: ts.Node, hit: FactoryHit): void => {
      if (!st.visited.has(n)) {
        st.visited.add(n);
        walk(n, hit.via, hit.depth);
      }
    };
    // Метод по имени — из фабрики, которую экран вызвал сам, или из внедрённой:
    // её не вызывает ни один экран (создаёт оболочка, экран берёт из контекста).
    // Чужой стор (его фабрику вызывают другие экраны) не берётся.
    const byName = (body: ts.Node, hit: FactoryHit): void => {
      const fn = factoryOf(body);
      if (fn === undefined || st.factories.has(fn) || !reach.has(fn)) {
        enter(body, hit);
      }
    };
    const walk = walkScreen(
      ctx,
      screen,
      callIds,
      sameService,
      st,
      (fn, hit) => {
        if (!st.factories.has(fn)) {
          st.factories.set(fn, hit);
        }
        if (own(fn)) {
          enter(fn, hit);
        }
      },
      byName,
    );
    for (const [fn, hit] of [...st.factories]) {
      if (own(fn)) {
        enter(fn, hit);
      }
    }
    for (const { body, hit } of st.byName.splice(0)) {
      byName(body, hit);
    }
  });
  return states.map((st) => [...st.out.values()]);
}
