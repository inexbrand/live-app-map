/** Старый загрузчик тегов: ни один экран его не импортирует. */
export function loadTags() {
  return fetch('/api/admin/tags');
}
