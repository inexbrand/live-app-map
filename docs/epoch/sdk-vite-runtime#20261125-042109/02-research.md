# Ресерч

- Контракт: `packages/sdk/src/project.ts` — LamApiOverride, LamComponentFixtures, LAM_STATE_PARAM.
- Компонент под элементом уже умеет пикер визуализатора: `apps/visualizer-spa/src/lib/gateway/pick-dom.ts`
  (fiberOf, debugPlaceOf, componentChainOf), `pick-source.ts` (componentNameOf, frameFromStack, mapFrame).
  Функции встраиваются в страницу текстом (toString) — `pick-script.ts`. Тот же приём годится для рантайма SDK.
- React 19: `_debugStack` — место JSX (файл владельца). Файл самого компонента = кадр стека у fiber, чей `_debugOwner` — этот компонент.
- korbor miniapp: Vite 8, @vitejs/plugin-react 6, React 19.2; провайдеры — `apps/miniapp/src/app/providers.tsx#AppProviders`; CSS — `src/index.css` из main.tsx.
- В монорепо LAM: vite 6.4, plugin-react 4.7, react 19.2 — в .bun-хранилище, есть у visualizer-spa.

## Покрытие

| Должно | Есть до задачи |
|---|---|
| подмена API по состоянию | нет |
| дерево компонентов страницы | частично: пикер одного элемента |
| страница одного компонента | нет |
| галерея компонентов в визуализаторе | нет |
