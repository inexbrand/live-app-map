import { describe, expect, test } from 'bun:test';
import { lamBundleSource, lamIndexedPosition, lamIndexMap, lamIsBundleFile, originalPosition } from '../src/runtime/sourcemap';

// Две строки бандла: первая из src/App.tsx (строка 1), вторая — из react в node_modules (строка 5)
const MAP = { sources: ['../../../src/App.tsx', '../../../node_modules/react/index.js'], mappings: 'AAAA;ACIA' };

describe('sourcemap в странице', () => {
  test('индекс даёт то же, что проход с начала', () => {
    const ix = lamIndexMap(MAP);
    expect(lamIndexedPosition(ix, 1, 1)).toEqual(originalPosition(MAP, 1, 1));
    expect(lamIndexedPosition(ix, 2, 1)).toEqual({ source: '../../../node_modules/react/index.js', line: 5, column: 1 });
    expect(lamIndexedPosition(ix, 3, 1)).toBeNull();
  });

  test('путь исходника — от корня сайта, лишние .. упираются в корень', () => {
    expect(lamBundleSource('../../../src/App.tsx', 'http://h:1/assets/index-x.js.map')).toBe('src/App.tsx');
  });

  test('бандл — js, исходник dev-сервера — нет', () => {
    expect(lamIsBundleFile('assets/index-x.js')).toBe(true);
    expect(lamIsBundleFile('src/App.tsx')).toBe(false);
  });
});
