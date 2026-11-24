import { useEffect, useState } from 'react';
import { Card } from './Card';

/** Лента: fetch списка и XHR одной записи — то, что подменяет рантайм. */
export function App() {
  const [list, setList] = useState('загрузка');
  const [one, setOne] = useState('загрузка');
  useEffect(() => {
    fetch('/api/items?page=1')
      .then(async (r) => setList(r.status + ' ' + (await r.text())))
      .catch((e: unknown) => setList('ошибка ' + String(e)));
    const xhr = new XMLHttpRequest();
    xhr.open('GET', '/api/items/7');
    xhr.onload = () => setOne(xhr.status + ' ' + xhr.responseText);
    xhr.send();
  }, []);
  return (
    <main>
      <p data-testid="list">{list}</p>
      <p data-testid="one">{one}</p>
      <Card title="Первая" />
    </main>
  );
}
