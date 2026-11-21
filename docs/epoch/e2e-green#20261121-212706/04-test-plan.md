# Test plan

- bun test: build-map-catalog-fs.test (настоящая папка public/maps), korbor-dogfood.test (настоящий HTTP-сервер вместо korbor, считает обмены и отдаёт 429).
- e2e: overlap (+ проверка высоты шапки < 70 px), smoke и import-clear считают экраны по мини-карте (рисует все ноды) и сверяют с каталогом / файлом.
- Полный `bunx playwright test` против живого korbor — 3 раза подряд; `bun run typecheck` в корне.
