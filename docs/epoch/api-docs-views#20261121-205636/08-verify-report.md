# Проверка построчно

## Чеклист brief

| Пункт | Доказательство |
|---|---|
| Вид «API»: группы, метод, путь, описание, вход, доступ, таблицы, экраны, файл:строка | screens/api-korbor-card.png, api-korbor-filter.png; e2e «дерево, фильтры, карточка…» |
| Поиск и фильтры, переходы роут ↔ таблица ↔ экран | e2e: PATCH + vacancies → карточка → таблица vacancies → роут (фильтры сохранены) → экран на холсте; screens/db-korbor-routes-clickable.png |
| «Без описания» | e2e: остаются только строки без описания (>200 из 314); screens/api-korbor-undocumented.png |
| Вид «Документация»: эпохи, готовность, файлы, заметки, руководства, markdown, скриншоты, ссылки | e2e korbor: 26 эпох, «не готово» perf-load-test с открытыми пунктами, ссылка `POST /api/v1/auth/web/telegram-login` из текста открывает роут; screens/docs-korbor-not-ready.png |
| Свои docs/epoch live-app-map | e2e: эпоха api-docs-views в списке, live-korbor-e2e — галерея 15 скриншотов грузится (naturalWidth > 0), полноэкранный просмотр; screens/docs-lam-epoch.png, docs-lam-zoom.png |
| vpn-saas | Локальная карта (не в git): 286 роутов, 163 эпохи (29 «не готово»); screens/api-vpn-saas-admin.png, docs-vpn-saas-admin.png |
| Сканер `docs` по `--code-dir` | scanner-docs тесты на живых korbor, vpn-saas, live-app-map; cli code-scan.test |
| MCP | mcp-server server.test: list_epochs, get_epoch, search_docs, describe_api через stdio |
| Дизайн | 06-decisions; Medeo, без надзаголовков, без 01/02, без градиентных карточек; радиусы 6/8 |
| Экраны | screens/screens-korbor.png — холст не сломан |

## Тесты: реальные вызовы?

Да. Тесты сканера читают фикстуры и настоящие репо; тесты моделей вида читают настоящие карты
korbor-all и live-app-map; MCP — через stdio настоящего сервера; e2e — живой dev-сервер.

## Баги

См. 09-bugs.md
