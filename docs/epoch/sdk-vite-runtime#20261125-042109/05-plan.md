# План

1. sdk/src/runtime/*.ts — функции рантайма (текстом): разбор id, сопоставление ключа API, подмена fetch/XHR, дерево fiber.
2. sdk/src/vite.ts — lamVite: поиск states.ts, transformIndexHtml, middleware /@lam/state, /@lam/component, виртуальный модуль входа.
3. Тесты test/*.test.ts на фикстуре.
4. Перенос общих функций пикера в sdk, визуализатор импортирует.
5. Живая проверка korbor.
6. Вкладка «Компоненты».

## Файлы

- packages/sdk/src/{vite.ts,runtime/*.ts,index.ts}, packages/sdk/test/**, packages/sdk/package.json
- apps/visualizer-spa/src/... (вид «Компоненты»)
