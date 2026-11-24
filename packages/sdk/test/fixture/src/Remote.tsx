import { useEffect, useState } from 'react';

/** Компонент, который сам ходит в API: вариант галереи подменяет ответ. */
export function Remote() {
  const [text, setText] = useState('загрузка');
  useEffect(() => {
    fetch('/api/items').then(async (r) => setText(r.status + ' ' + (await r.text())));
  }, []);
  return <p data-testid="remote">{text}</p>;
}
