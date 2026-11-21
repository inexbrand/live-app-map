# Impact

- `MapToolbar.tsx`, `global.css`: подписи вкладок вида в `.toolbar__label`; на ширине < 1280 px скрыты визуально (доступное имя кнопки остаётся — getByRole по имени работает). У «Экраны» появилась иконка.
- `LamMiniMap.tsx`: класс ноды мини-карты `lam-minimap-<frame|page|service>` (был только frame) — minimap.e2e опирается на `lam-minimap-frame`, не меняется.
- `build-map-catalog-fs.ts`: pageCount = экраны (kind=page после `liveAppMapToAppMap`) для обоих форматов. Меняются подписи каталога: Весь Korbor 111→91, Мини-приложение 40→20, Админка 78→58, Сайт 33→13.
- `korbor-dogfood.ts`, `sessions-middleware.ts`: Bearer мини-аппа кэшируется до exp токена (одна память на процесс dev-сервера).
