import { describe, expect, test } from 'bun:test';
import path from 'node:path';
import { resolveSnapshotBrowserPath } from './snapshot-browser';

describe('resolveSnapshotBrowserPath', () => {
  const helium = path.join('C:/Users/u/AppData/Local', 'imput', 'Helium', 'Application', 'chrome.exe');

  test('LAM_BROWSER_PATH важнее Helium', () => {
    expect(resolveSnapshotBrowserPath({ LAM_BROWSER_PATH: 'D:/b.exe', LOCALAPPDATA: 'C:/Users/u/AppData/Local' }, () => true)).toBe('D:/b.exe');
  });

  test('без переменной берёт установленный Helium', () => {
    expect(resolveSnapshotBrowserPath({ LOCALAPPDATA: 'C:/Users/u/AppData/Local' }, (p) => p === helium)).toBe(helium);
  });

  test('Helium нет — undefined, Playwright решает сам', () => {
    expect(resolveSnapshotBrowserPath({ LOCALAPPDATA: 'C:/Users/u/AppData/Local' }, () => false)).toBeUndefined();
    expect(resolveSnapshotBrowserPath({}, () => true)).toBeUndefined();
  });
});
