/**
 * Примеры параметров маршрутов из конфига: значение для [id] и [...slug].
 */


/** Значение example-параметра: скаляр или сегменты catch-all. */
export type ParamExampleValue = string | readonly string[];

/** Переопределения example-параметров по pathPattern. */
export type ExampleParamsByRoute = Readonly<
  Record<string, Readonly<Record<string, ParamExampleValue>>>
>;

/**
 * Примеры dynamic params для materialize.
 * Именованные ключи — имена параметров; `byRoute` — override per pathPattern.
 */
export type ExampleParamsConfig = {
  readonly byRoute?: ExampleParamsByRoute;
  readonly [paramName: string]:
    | ParamExampleValue
    | ExampleParamsByRoute
    | undefined;
};

/**
 * Читает example-значение параметра (byRoute → top-level; byRoute-ключ игнорируется).
 */
export function getExampleParam(
  exampleParams: ExampleParamsConfig,
  name: string,
  byRoute?: Readonly<Record<string, ParamExampleValue>>,
): ParamExampleValue | undefined {
  const fromRoute = byRoute?.[name];
  if (fromRoute !== undefined) {
    return fromRoute;
  }
  if (name === 'byRoute') {
    return undefined;
  }
  const v = exampleParams[name];
  if (typeof v === 'string' || Array.isArray(v)) {
    return v;
  }
  return undefined;
}
