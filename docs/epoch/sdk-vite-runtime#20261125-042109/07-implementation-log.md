# Журнал

- cabbf11 feat(sdk): lamVite, рантайм (api, components, fiber, install), states-file, тесты + фикстура.
- 715945c refactor(gateway): пикер берёт функции fiber из @live-app-map/sdk/runtime.
- Живая проверка korbor: временный vite.lam-check.config.ts (mergeConfig с vite.config.ts + lamVite) и временный .live-app-map/states.ts — удалены после проверки, в korbor не коммитились.
- 3d5e5d5 модель галереи (lib/components-gallery/gallery.ts).
- ad7e299 вкладка «Компоненты»: view-store/view-tabs/nav-location/App.tsx (минимально), components/components-view/*, store/components-store.ts, stream-screens.ts.
- 2a5d9f5 приложения галереи — из GET /__lam_project/config (решение лида), components — из /__lam_project/states.
- 32c99d3 stream-sync.ts (файл states, по согласованию с лидом): видимые варианты галереи в общем streamClient.sync.
