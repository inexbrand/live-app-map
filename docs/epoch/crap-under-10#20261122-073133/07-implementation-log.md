# Implementation log

- Инфраструктура тестов DOM: src/test/dom.ts (happy-dom на файл), первый тест EdgeSheet; весь unit 735/735.- Шапка (MapToolbar.test.tsx, 21 тест): крошки — по функции на вид; загрузчик карт — функции модуля; chooseMap; ensureDogfoodSessions — mintAdmin/mintMiniapp/ensureMiniapp; dogfood-api — sessionErrorDetail, adminInject/userInject. Тесты проходят на старом и новом коде (pinOld: git show HEAD во временную подмену файла). crapper по 15 файлам — 0.
- Профили входа: SessionProfilesPanel — mapOrigins/httpOrigin, submitSession, GatewayDown, ProfileItem, DogfoodFields, PasteFields, FormOutcome; session-form — dogfoodRequest/pasteRequest; тест store шлюза (refresh, loadSamples). Найден и исправлен баг полей при смене способа входа (09).
