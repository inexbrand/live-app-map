import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { packSdk, publishManifest, sdkEntries, tarballName, type SdkManifest } from './pack';

const manifest: SdkManifest = {
  name: '@live-app-map/sdk',
  version: '1.2.3',
  exports: { '.': './src/index.ts', './vite': './src/vite/plugin.ts' },
  peerDependencies: { vite: '>=5' },
};

describe('publishManifest', () => {
  test('exports на dist с типами, files только dist, peer сохранены', () => {
    expect(publishManifest(manifest)).toEqual({
      name: '@live-app-map/sdk',
      version: '1.2.3',
      type: 'module',
      exports: {
        '.': { types: './dist/index.d.ts', import: './dist/index.js' },
        './vite': { types: './dist/vite/plugin.d.ts', import: './dist/vite/plugin.js' },
      },
      files: ['dist'],
      peerDependencies: { vite: '>=5' },
    });
  });
  test('точка не из src — ошибка с ключом', () => {
    expect(() => sdkEntries({ ...manifest, exports: { './x': './dist/x.js' } })).toThrow('exports["./x"]');
  });
  test('имя tarball как у npm pack', () => {
    expect(tarballName(manifest)).toBe('live-app-map-sdk-1.2.3.tgz');
  });
});

describe('packSdk', () => {
  test('собирает настоящий tarball пакета', async () => {
    const out = mkdtempSync(path.join(tmpdir(), 'lam-sdk-out-'));
    try {
      const file = await packSdk(path.resolve(import.meta.dir, '..'), out);
      const list = Bun.spawnSync(['tar', '-tzf', path.basename(file)], { cwd: out }).stdout.toString();
      expect(list).toContain('package/package.json');
      expect(list).toContain('package/dist/index.js');
      expect(list).toContain('package/dist/index.d.ts');
      expect(list).not.toContain('package/src/');
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }, 120_000);
});
