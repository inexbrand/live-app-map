# План тестов

Реальный `createServer` Vite с фикстурой React-приложения (packages/sdk/test/fixture), браузер — headless Helium через playwright-core:
- без lam_state fetch идёт на сервер фикстуры;
- `?lam_state=app:route:/x/empty` — fetch и XHR получают body/status из states.ts; :параметры; delayMs;
- 'pending' — запрос не завершается;
- sessionStorage lam_state работает так же;
- /@lam/state: 200 с api, 404 с подсказкой для неизвестного id;
- __LAM__.components(): имя, файл исходника, рамка;
- /@lam/component: вариант рендерится с props, обёртка применена, api варианта подменено;
- vite build фикстуры: в dist нет `__LAM__`/`lam_state`.
