# Влияние

- `packages/schema`: новые типы `ApiCall`, `ScreenApi`, необязательные поля `CodeModel.apiCalls/screens` (карты v2 без них остаются валидными); `EdgeKind 'api'`; `codeFileOfNode` переезжает из SPA в schema (одно место решения для CLI и SPA).
- `packages/scanner-source`: новые модули вычисления значений и поиска вызовов; `scanSource` принимает `entries` (файлы экранов).
- `packages/cli`: `withSourceCode` передаёт файлы экранов и строит рёбра api; сводка `code` — числа вызовов.
- `apps/visualizer-spa`: `node-code.ts` (вид экрана), `CodePanel`, переход к роуту через store, рёбра api на холсте.
- Старые карты: поля необязательны; zod проверяет новые поля, если они есть.
