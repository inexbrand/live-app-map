# Plan

1. Контракт `apps/visualizer-spa/src/lib/db-data/contract.ts` (zod) — коммит до старта зон.
2. Зона «db-api» (тиммейт): `database` в LamProjectConfig, middleware `/__lam_db/*` на postgres.js, тесты.
3. Зона «db-grid» (тиммейт): `components/database/DataGrid*`, клиент и стор правок, тесты.
4. Зона лида: раскладка с разделителями (shadcn resizable), ER-схема, правая панель (документация, код, замечание), эндпоинт исходника.
5. Сведение, typecheck, тесты пакета, живая проверка на korbor, коммит + пуш.
