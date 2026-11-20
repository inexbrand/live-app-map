# 08 — Проверка

## Тесты (точечно)

| Команда | Итог |
|---|---|
| `bun test packages/schema packages/scanner-source packages/cli` | 62 pass / 0 fail |
| `bun test packages` (после схемы v2, до scanner-source) | 176 pass / 0 fail |
| `bun test apps/visualizer-spa/src/lib` | 68 pass / 0 fail |
| `bun test apps/visualizer-spa/src/store` | 32 pass; 1 ошибка загрузки файла `korbor-all-hosts.test.ts` (`KORBOR_PRESETS missing id=korbor-all`) — была до правок |

## Typecheck

`tsc --noEmit` по schema, scanner-source, cli, visualizer-spa: новых ошибок нет. Остаются старые: `schema/src/convert.ts` (viewport без height; исправлено в ветке другого агента 9c97f49), в SPA — отсутствующие модули и старые тесты.

## Реальные проекты (`bun run packages/cli/src/bin.ts code --dir …`)

| Проект | Файлов | Сервисов | Роутов | с описанием | с запросами в БД | в цикле | Таблиц | Символов | Время | Размер карты |
|---|---|---|---|---|---|---|---|---|---|---|
| korbor | 2129 | 20 | 260 | 55 | 221 | 0 | 73 | 8182 | 4,5 с | 4,4 МБ |
| vpn-saas | 2117 | 46 | 278 | 16 | 204 | 0 | 103 | 10539 | 3,8 с | 7,3 МБ |

Пример (korbor):

```json
{"method":"GET","path":"/api/v1/recruiter/vacancies",
 "doc":"`GET /api/v1/recruiter/vacancies` — блок 050-фильтры-ленты-вакансий.md",
 "db":["select applications via ApplicationLookupPort.countActiveApplicationsBatch",
       "select companies via CompanyNameLookupPort.findCompanyNames",
       "select vacancies via VacancyRepository.listFeed",
       "select vacancyFavorites via FavoriteLookupPort.isFavoritedBatch", "…"]}
{"name":"legal_documents","exportName":"legalDocuments","orm":"drizzle",
 "doc":"Table `legal_documents` — блок 024-согласие-пдн-и-оферта.md §2.1, §4.3.",
 "cols":["id:text","code:text","version:text","…","isCurrent:boolean","createdAt:timestamp"]}
```

## Визуализатор вживую

Playwright на :4311 (временное слияние + заглушки, см. 07), карта `scan --dir korbor/apps/miniapp --code-dir korbor --format liveappmap`:
20 нод сервисов на холсте; клик по `@korbor/api` открывает правую панель: «Роуты · 100 из N» с методом, путём, описанием, «БД: …», `файл:строка`; фильтр «vacancies recruiter» → 5 роутов; ниже таблицы с колонками. Ошибок страницы нет.
