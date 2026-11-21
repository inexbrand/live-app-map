# Замечания к экранам: хранение и инструменты агента

Замечания живут в папке обмена `.lam-feedback/` (вне git; путь меняет `LAM_FEEDBACK_DIR`).
Пишут двое: визуализатор (через dev-сервер, автор `user`) и MCP-сервер (агент, автор `agent`).
Чтобы двое писателей не мешали друг другу, файл не переписывается никогда: каждое изменение — новый файл-событие,
ветка собирается свёрткой событий.

## Раскладка

```
.lam-feedback/comments/<id>/
  <stamp>-<rand8>-created.json   первое событие: текст, автор, привязка
  <stamp>-<rand8>-reply.json     ответ (агента или человека)
  <stamp>-<rand8>-status.json    смена статуса open ⇄ fixed
  shot.png                       снимок компонента (если был)
```

- `id` — `[A-Za-z0-9_-]{1,80}`, обычно UUID из браузера; повторное создание с тем же id ничего не меняет.
- Запись атомарная: `*.tmp` → `rename`.
- Порядок событий — поле `seq` (created — 0, дальше max+1); время `at` — только для двух событий с одним `seq`.

## Событие

Схема — `packages/mcp-server/src/comments-schema.ts` (zod, проверка при чтении).

```jsonc
// created
{ "type": "created", "seq": 0, "at": "2026-11-21T19:00:00.000Z", "id": "…", "author": "user",
  "text": "Сумма прижата к краю карточки",
  "anchor": {
    "mapName": "korbor-miniapp", "pageId": "route:/feed", "pageTitle": "feed",
    "pageUrl": "http://…/#/feed", "role": null,
    "element": {                                   // null — замечание ко всему экрану (область)
      "selector": "div[data-testid=\"vacancy-feed-card\"]:nth-of-type(1) > a.flex.h-full > …",
      "domPath": "div#root > div.app-shell > …",   // для человека
      "tag": "p", "text": "4 920 UZS",
      "rect": { "x": 16, "y": 120, "width": 300, "height": 40 },   // координаты документа страницы
      "viewport": { "width": 390, "height": 844 },
      "component": {
        "name": "Card", "chain": ["Card", "VacancyFeedCard", "FeedScreen"],
        "source": { "file": "apps/miniapp/src/features/vacancy-feed-screen/VacancyFeedCard.tsx", "line": 171,
                    "origin": "react-stack" }      // react-stack — из dev-стека React + sourcemap; code-map — из раздела code карты
      }
    }
  },
  "shot": "shot.png" }
// reply
{ "type": "reply", "seq": 1, "at": "…", "author": "agent", "text": "Добавил отступ 12px",
  "files": ["apps/miniapp/src/…/VacancyFeedCard.tsx"], "commit": null }
// status
{ "type": "status", "seq": 2, "at": "…", "author": "agent", "status": "fixed", "note": null }
```

Статус ветки — последний `status`; без него — `open` (замечание, созданное агентом, — `fixed`: это запись о сделанном).

## MCP-инструменты

| Инструмент | Что делает |
|---|---|
| `list_comments` | список веток, свежие сверху; фильтры `status`, `pageId`, `mapName`, `author`, `query` |
| `get_comment` | ветка целиком + `shotPath` — путь к снимку для просмотра |
| `add_change_note` | ответ агента: `commentId` (или `pageId` + `selector` — новая запись), `text`, `files`, `commit`; `resolve` (по умолчанию да) ставит «исправлено» |
| `resolve_comment` / `reopen_comment` | сменить статус с пояснением |

Кнопка «Для агента» в ветке копирует текст с привязкой и `commentId` для ответа.

## HTTP визуализатора (dev)

- `GET /api/comments?status=&pageId=&mapName=&author=&q=`, `POST /api/comments` — новое замечание (автор всегда `user`);
- `POST /api/comments/<id>/events` — ответ или статус от человека;
- `GET /api/comments/<id>/shot.png`.

Только с локального origin. Пустой текст — 400 «текст замечания пустой: напишите, что не так».

## Модели речи

Голос распознаёт Whisper в браузере (transformers.js, WebGPU или WASM); звук не покидает вкладку.
Файлы моделей — `.lam-models/` (вне git; `LAM_MODELS_DIR`) и Cache Storage браузера.
`/__lam_models/hf/…` отдаёт файл с диска, иначе копирует из зеркала `LAM_MODELS_MIRROR` (общий диск команды) или
скачивает с Hugging Face — только модели из списка. Источник молчит 60 с или клиент ушёл — загрузка обрывается, `.part` удаляется.
