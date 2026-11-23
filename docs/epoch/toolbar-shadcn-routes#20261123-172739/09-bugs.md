# Баги

| Пункт | Статус | Что |
|---|---|---|
| node-code.test: пустые вызовы API на fixtures | open (не эта задача) | `apps/visualizer-spa/src/lib/node-code.test.ts` — 2 падения: `selectNodeCode` экрана без вызовов, у роута нет экранов. Тест сканирует `fixtures/source-monorepo`; правка этой задачи сканер и fixtures не трогала. Причину не искал. |
| PowerShell-процессы: 1274 дочерних у powershell 5800 (родитель bash 24264) | open (среда) | съедают ~4.7 ГБ; `Stop-Process` и `taskkill /T` — «Отказано в доступе». Нужен перезапуск терминала или права администратора. |
| Карта, открытая по URL `?map=korbor-all` без пути | open (мелочь) | ошибка «сервер вернул веб-страницу»; работает `?map=/maps/korbor-all.liveappmap.json`. Не правил. |
