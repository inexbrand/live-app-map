# План реализации

## Шаги
1. schema: типы и zod, `EdgeKind 'api'`, перенос `codeFileOfNode`.
2. scanner-source: `api-value.ts` (вычисление строк/объектов/клиентов с происхождением частей), `api-clients.ts` (fetch/axios/ky/eden/hono), `api-calls.ts` (поиск по местам вызова + обёртки), `api-match.ts` (матчинг), `screen-calls.ts` (достижимость от экрана), env-файлы.
3. Фикстура + тесты scanner-source.
4. cli: entries, рёбра, сводка; тест.
5. spa: `selectNodeCode`, CodePanel, переход к роуту, стиль ребра; тест.
6. korbor / vpn-saas числа, Playwright, epoch 06–09, PR.

## Файлы
- packages/schema/src/{code-model.ts,code-model-zod.ts,types.ts,zod.ts,code-path.ts,index.ts}
- packages/scanner-source/src/{api-value.ts,api-clients.ts,api-calls.ts,api-match.ts,screen-calls.ts,env-files.ts,scan-source.ts}
- packages/cli/src/{code-scan.ts,bin.ts}
- apps/visualizer-spa/src/{lib/node-code.ts,components/CodePanel.tsx,store/app-store.ts,flow/*}
