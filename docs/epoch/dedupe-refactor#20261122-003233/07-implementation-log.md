# Implementation log

- Исправлена утечка мока fetch в packages/react (45 ложных падений unit) — иначе нечем доказывать «поведение то же».
- MCP: `tool-kit.ts` — типы, ok/fail, str/rawStr/optionalStr/strList/requiredStr, mapPathParam, toolCatalog. Инструмент = описание + handler в одном объекте; каталог и карта обработчиков собираются из одного списка. map-tools: общий кэш по mtime; agent-state: agentFile + имена файлов константами.
  Доказательство: golden (scratchpad mcp-golden.ts, 50 вызовов, все ошибки и успехи) до/после — байт в байт; снимок каталога tools/list снят на старом коде и проходит на новом.
