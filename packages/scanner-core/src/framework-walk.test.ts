import { afterEach, describe, expect, test } from 'bun:test';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  assembleDocument,
  contentRevision,
  detectFramework,
  humanTitle,
  isExcluded,
  walkFiles,
  type WalkFsError,
} from './index';

const tempDirs: string[] = [];

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir !== undefined) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // cleanup best-effort
      }
    }
  }
});

describe('isExcluded', () => {
  test('default excludes node_modules / dist / __tests__', () => {
    expect(isExcluded('node_modules/pkg/index.js')).toBe(true);
    expect(isExcluded('dist/out.js')).toBe(true);
    expect(isExcluded('src/__tests__/x.ts')).toBe(true);
    expect(isExcluded('.next/server/app.js')).toBe(true);
    expect(isExcluded('src/app/page.tsx')).toBe(false);
  });

  test('strips **/ prefix and /** suffix globs to segment name', () => {
    expect(isExcluded('vendor/foo/bar.ts', ['**/vendor/**'])).toBe(true);
    expect(isExcluded('src/vendor/x.ts', ['**/vendor/**'])).toBe(true);
    expect(isExcluded('src/app/page.tsx', ['**/vendor/**'])).toBe(false);
    expect(isExcluded('build/a.js', ['build/**'])).toBe(true);
  });

  test('custom exclude list does not use defaults', () => {
    expect(isExcluded('node_modules/x', ['only-this'])).toBe(false);
    expect(isExcluded('only-this/file.ts', ['only-this'])).toBe(true);
  });
});

describe('detectFramework', () => {
  test('next: app + next.config', () => {
    const root = makeTempDir('lam-fw-next-');
    mkdirSync(path.join(root, 'app'), { recursive: true });
    writeFileSync(path.join(root, 'next.config.mjs'), 'export default {};\n');
    writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ name: 'demo', dependencies: { next: '15.0.0' } }),
    );
    expect(detectFramework(root)).toBe('next');
  });

  test('next: app dir without react-router', () => {
    const root = makeTempDir('lam-fw-next-app-');
    mkdirSync(path.join(root, 'app'), { recursive: true });
    writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ name: 'demo', dependencies: {} }),
    );
    expect(detectFramework(root)).toBe('next');
  });

  test('react-router: package dependency', () => {
    const root = makeTempDir('lam-fw-rr-');
    writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({
        name: 'demo',
        dependencies: { 'react-router-dom': '7.0.0' },
      }),
    );
    expect(detectFramework(root)).toBe('react-router');
  });

  test('react-router: router.tsx marker', () => {
    const root = makeTempDir('lam-fw-rr-marker-');
    mkdirSync(path.join(root, 'src', 'app'), { recursive: true });
    writeFileSync(path.join(root, 'src', 'app', 'router.tsx'), 'export {};\n');
    writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ name: 'demo', dependencies: {} }),
    );
    expect(detectFramework(root)).toBe('react-router');
  });

  test('unknown: empty project', () => {
    const root = makeTempDir('lam-fw-unknown-');
    writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ name: 'empty', dependencies: {} }),
    );
    expect(detectFramework(root)).toBe('unknown');
  });
});

describe('contentRevision', () => {
  test('stable for same parts order', () => {
    const a = contentRevision(['n1|/a|', 'e1']);
    const b = contentRevision(['n1|/a|', 'e1']);
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{16}$/);
  });

  test('changes when parts or order change', () => {
    const base = contentRevision(['x', 'y']);
    expect(contentRevision(['y', 'x'])).not.toBe(base);
    expect(contentRevision(['x', 'z'])).not.toBe(base);
  });
});

describe('assembleDocument', () => {
  test('revision matches contentRevision of nodes/edges', () => {
    const nodes = [
      {
        id: 'route:/',
        kind: 'page' as const,
        pathPattern: '/',
        url: '/',
        title: 'Home',
      },
    ];
    const edges = [
      {
        id: 'e1',
        from: 'route:/',
        to: 'route:/about',
        kind: 'link' as const,
        confidence: 'high' as const,
      },
    ];
    const expected = contentRevision(['route:/|/|/', 'e1']);
    const doc = assembleDocument({
      projectRoot: '/tmp/demo',
      projectName: 'demo',
      framework: 'next',
      baseUrl: 'http://localhost:3000',
      nodes,
      edges,
    });
    expect(doc.revision).toBe(expected);
    expect(doc.kind).toBe('live-app-map');
    expect(doc.project.framework).toBe('next');
    expect(doc.baseUrl).toBe('http://localhost:3000');
    expect(doc.nodes).toEqual(nodes);
    expect(doc.edges).toEqual(edges);
  });
});

describe('humanTitle', () => {
  test('корень — «Главная»', () => {
    expect(humanTitle('/')).toBe('Главная');
    expect(humanTitle('')).toBe('Главная');
  });

  test('strips dynamic and catch-all brackets', () => {
    expect(humanTitle('/users/[id]')).toBe('users / id');
    expect(humanTitle('/shop/[...slug]')).toBe('shop / slug');
    expect(humanTitle('/docs/[[...path]]')).toBe('docs / path');
  });
});

describe('walkFiles', () => {
  test('lists files sorted, skips excluded', () => {
    const root = makeTempDir('lam-walk-');
    mkdirSync(path.join(root, 'src'), { recursive: true });
    mkdirSync(path.join(root, 'node_modules', 'pkg'), { recursive: true });
    writeFileSync(path.join(root, 'src', 'a.ts'), 'export {};\n');
    writeFileSync(path.join(root, 'src', 'b.ts'), 'export {};\n');
    writeFileSync(path.join(root, 'node_modules', 'pkg', 'x.js'), '1;\n');
    expect(walkFiles(root)).toEqual(['src/a.ts', 'src/b.ts']);
  });

  test('readdir FS error invokes onFsError with reason (not silent)', () => {
    const root = makeTempDir('lam-walk-fs-');
    const filePath = path.join(root, 'not-a-dir.txt');
    writeFileSync(filePath, 'x');
    const errors: WalkFsError[] = [];
    const files = walkFiles(filePath, {
      onFsError: (info) => {
        errors.push(info);
      },
    });
    expect(files).toEqual([]);
    expect(errors.length).toBe(1);
    const first = errors[0];
    expect(first).toBeDefined();
    if (first === undefined) {
      throw new Error('expected onFsError call');
    }
    expect(first.phase).toBe('readdir');
    expect(first.reason).toContain('skip: readdir failed');
    expect(first.absPath).toBe(filePath);
  });

  test('backward-compatible exclude array still works', () => {
    const root = makeTempDir('lam-walk-ex-');
    mkdirSync(path.join(root, 'keep'), { recursive: true });
    mkdirSync(path.join(root, 'drop'), { recursive: true });
    writeFileSync(path.join(root, 'keep', 'a.ts'), '1;\n');
    writeFileSync(path.join(root, 'drop', 'b.ts'), '1;\n');
    expect(walkFiles(root, ['drop'])).toEqual(['keep/a.ts']);
  });
});
