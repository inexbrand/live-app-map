---
name: shadcn-base-ui-spa
description: "SPA визуализатора на shadcn (Base UI, nova, Tailwind v4) — грабли стилей, тестов и dev-сервера"
metadata:
  node_type: memory
  type: project
  originSessionId: a29e1f25-91b1-41ef-8592-902a7bd0f8c8
  modified: 2026-11-23T13:45:09.511Z
---

Визуализатор с 2026-11-23 целиком на shadcn (Base UI, стиль nova, Tailwind v4, `cn` из пакета `cn`); свой kit `src/ui` удалён. Списки — только `components/option-select.tsx` (на кнопке `data-value`).

- Старый `styles/global.css` грузится после `index.css`. Любое правило без `@layer` сильнее утилит Tailwind: `button { color: inherit }` делало активную кнопку белой без текста. Сбросы — только в `@layer base`.
- DOM-тесты: пункты Select — в портале, искать `within(document.body)`; выбор — `pickOption`/`listOptions` из `src/test/select.ts`. Toggle/ToggleGroup — `aria-pressed`, не классы. shadcn Alert — `role="alert"`. Закрытие Base UI Dialog по Esc в happy-dom висит ~100 с — проверять `aria-expanded`.
- Тестовые файлы с CRLF: многострочная замена молча не находит — нормализовать `\r\n` и проверять, что шаблон найден.
- vite :4310 после чужой горячей правки стора может загрузить две копии `app-store.ts` (`?t=...`): шапка видит карту, вид — нет (пустой экран без ошибок). Лечится перезапуском vite. Проверка — `performance.getEntriesByType('resource')` в странице.

**Why:** на этом потеряно несколько кругов проверки 2026-11-23.
**How to apply:** новый компонент — из `@/components/ui` через CLI; пустой экран при живой карте — сначала смотреть дубли модулей стора. Связано: [[spa-dom-tests-happy-dom]], [[visualizer-ux-overhaul-lessons]].
