/** Скрипт обслуживания: удаляет тестовый заказ (не экран). */
export async function cleanup(): Promise<void> {
  await fetch('/orders/1', { method: 'DELETE' });
}
