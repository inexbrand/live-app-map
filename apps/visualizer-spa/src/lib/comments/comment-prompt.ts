/**
 * Замечание текстом для агента: что не так, где (экран, компонент,
 * исходник, селектор) и как ответить через MCP.
 */
import type { CommentThread } from '@live-app-map/mcp-server/comments-schema';

/**
 * Markdown для вставки в чат агента.
 *
 * @param thread - ветка замечания
 */
export function commentPrompt(thread: CommentThread): string {
  const a = thread.anchor;
  const el = a.element;
  const code = a.code;
  const lines = [code === undefined ? `## Замечание к экрану «${a.pageTitle}»` : `## Замечание к таблице «${a.pageTitle}»`, '', thread.text, ''];
  if (code === undefined) {
    lines.push(`- Экран: ${a.pageId}${a.pageUrl === null ? '' : ` (${a.pageUrl})`}`);
  } else {
    lines.push(`- Объявление: ${code.name} — ${code.file}:${code.line}–${code.endLine}`);
  }
  if (a.role !== null) {
    lines.push(`- Роль: ${a.role}`);
  }
  if (el !== null) {
    const comp = el.component;
    if (comp !== null) {
      const src = comp.source === null ? '' : ` — ${comp.source.file}${comp.source.line === null ? '' : `:${comp.source.line}`}`;
      lines.push(`- Компонент: ${comp.name}${src}`);
      if (comp.chain.length > 1) {
        lines.push(`- Над ним: ${comp.chain.slice(1).join(' › ')}`);
      }
    }
    lines.push(`- Элемент: \`${el.selector}\`${el.text === '' ? '' : ` «${el.text}»`}`);
  }
  lines.push('', `Исправив, ответьте MCP-инструментом add_change_note с commentId «${thread.id}»: что изменено, файлы, коммит.`);
  return `${lines.join('\n')}\n`;
}
