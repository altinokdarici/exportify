import { beforeEach, afterEach, describe, it, expect } from '@jest/globals';
import { mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { generateExportsMap, type PackageInfo } from './generateExportsMap.js';
import type { PackageUsage } from '../../types.js';

const testDir = join(process.cwd(), 'tmp-exports-map-test');

beforeEach(async () => {
  await rm(testDir, { recursive: true, force: true });
  await mkdir(testDir, { recursive: true });
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe('generateExportsMap with pattern logic', () => {
  it('generates pattern-based exports for directory pattern', async () => {
    // Create package structure with CJS/ESM builds
    await mkdir(join(testDir, 'lib', 'cjs'), { recursive: true });
    await mkdir(join(testDir, 'lib', 'esm'), { recursive: true });
    await mkdir(join(testDir, 'src'), { recursive: true });

    // Create package.json with main/module fields
    await writeFile(
      join(testDir, 'package.json'),
      JSON.stringify({
        name: 'test-package',
        main: './lib/cjs/index.js',
        module: './lib/esm/index.js',
        types: './lib/index.d.ts',
      })
    );

    // Create build files
    await writeFile(join(testDir, 'lib', 'cjs', 'index.js'), 'module.exports = {};');
    await writeFile(join(testDir, 'lib', 'esm', 'index.js'), 'export {};');
    await writeFile(join(testDir, 'lib', 'index.d.ts'), 'export {};');

    // Create usage-based files
    await writeFile(join(testDir, 'lib', 'cjs', 'utils.js'), 'module.exports = {};');
    await writeFile(join(testDir, 'lib', 'esm', 'utils.js'), 'export {};');
    await writeFile(join(testDir, 'lib', 'utils.d.ts'), 'export {};');
    await writeFile(join(testDir, 'src', 'utils.ts'), 'export {};');

    const pkg: PackageInfo = {
      name: 'test-package',
      path: testDir,
      packageJsonPath: join(testDir, 'package.json'),
    };

    const usage: PackageUsage = {
      package: 'test-package',
      importPaths: ['./lib/utils.js'],
    };

    const result = await generateExportsMap(pkg, usage);

    expect(result).toEqual({
      '.': {
        types: './lib/index.d.ts',
        require: './lib/cjs/index.js',
        import: './lib/esm/index.js',
        default: './lib/cjs/index.js',
      },
      './lib/utils.js': {
        source: './src/utils.ts',
        types: './lib/utils.d.ts',
        import: './lib/esm/utils.js',
        require: './lib/cjs/utils.js',
        default: './lib/esm/utils.js',
      },
    });
  });

  it('falls back to standard generation when pattern expansion fails', async () => {
    // Create package structure without delta pattern
    await mkdir(join(testDir, 'lib'), { recursive: true });

    await writeFile(
      join(testDir, 'package.json'),
      JSON.stringify({
        name: 'test-package',
        main: './lib/index.js',
      })
    );

    await writeFile(join(testDir, 'lib', 'index.js'), 'module.exports = {};');
    await writeFile(join(testDir, 'lib', 'utils.js'), 'module.exports = {};');

    const pkg: PackageInfo = {
      name: 'test-package',
      path: testDir,
      packageJsonPath: join(testDir, 'package.json'),
    };

    const usage: PackageUsage = {
      package: 'test-package',
      importPaths: ['./lib/utils.js'],
    };

    const result = await generateExportsMap(pkg, usage);

    expect(result).toEqual({
      '.': {
        default: './lib/index.js',
        require: './lib/index.js',
      },
      './lib/utils.js': {
        default: './lib/utils.js',
        types: './lib/utils.d.ts',
      },
    });
  });

  it('preserves existing exports and only adds new ones', async () => {
    // Create package with existing exports
    await mkdir(join(testDir, 'lib', 'cjs'), { recursive: true });
    await mkdir(join(testDir, 'lib', 'esm'), { recursive: true });

    await writeFile(
      join(testDir, 'package.json'),
      JSON.stringify({
        name: 'test-package',
        main: './lib/cjs/index.js',
        module: './lib/esm/index.js',
        exports: {
          '.': {
            require: './lib/cjs/index.js',
            import: './lib/esm/index.js',
          },
          './existing': './lib/existing.js',
        },
      })
    );

    // Create new usage-based files
    await writeFile(join(testDir, 'lib', 'cjs', 'utils.js'), 'module.exports = {};');
    await writeFile(join(testDir, 'lib', 'esm', 'utils.js'), 'export {};');

    const pkg: PackageInfo = {
      name: 'test-package',
      path: testDir,
      packageJsonPath: join(testDir, 'package.json'),
    };

    const usage: PackageUsage = {
      package: 'test-package',
      importPaths: ['./lib/utils.js', './existing'], // Include existing export
    };

    const result = await generateExportsMap(pkg, usage);

    expect(result).toEqual({
      '.': {
        require: './lib/cjs/index.js',
        import: './lib/esm/index.js',
      },
      './existing': './lib/existing.js',
      './lib/utils.js': {
        import: './lib/esm/utils.js',
        require: './lib/cjs/utils.js',
        default: './lib/esm/utils.js',
      },
    });
  });

  it('handles extension-based patterns', async () => {
    await mkdir(join(testDir, 'lib'), { recursive: true });

    await writeFile(
      join(testDir, 'package.json'),
      JSON.stringify({
        name: 'test-package',
        main: './lib/index.cjs',
        module: './lib/index.mjs',
      })
    );

    // Create build files
    await writeFile(join(testDir, 'lib', 'index.cjs'), 'module.exports = {};');
    await writeFile(join(testDir, 'lib', 'index.mjs'), 'export {};');
    await writeFile(join(testDir, 'lib', 'utils.cjs'), 'module.exports = {};');
    await writeFile(join(testDir, 'lib', 'utils.mjs'), 'export {};');

    const pkg: PackageInfo = {
      name: 'test-package',
      path: testDir,
      packageJsonPath: join(testDir, 'package.json'),
    };

    const usage: PackageUsage = {
      package: 'test-package',
      importPaths: ['./lib/utils.js'],
    };

    const result = await generateExportsMap(pkg, usage);

    expect(result['./lib/utils.js']).toEqual({
      import: './lib/utils.mjs',
      require: './lib/utils.cjs',
      default: './lib/utils.mjs',
    });
  });

  it('skips pattern expansion when no multiple builds detected', async () => {
    await mkdir(join(testDir, 'lib'), { recursive: true });

    await writeFile(
      join(testDir, 'package.json'),
      JSON.stringify({
        name: 'test-package',
        main: './lib/index.js',
        // No module field - no delta possible
      })
    );

    await writeFile(join(testDir, 'lib', 'index.js'), 'module.exports = {};');
    await writeFile(join(testDir, 'lib', 'utils.js'), 'module.exports = {};');

    const pkg: PackageInfo = {
      name: 'test-package',
      path: testDir,
      packageJsonPath: join(testDir, 'package.json'),
    };

    const usage: PackageUsage = {
      package: 'test-package',
      importPaths: ['./lib/utils.js'],
    };

    const result = await generateExportsMap(pkg, usage);

    // Should use standard generation but with enhanced export object
    expect(result['./lib/utils.js']).toEqual({
      default: './lib/utils.js',
      types: './lib/utils.d.ts',
    });
  });

  it('handles complex nested directory structures', async () => {
    await mkdir(join(testDir, 'build', 'cjs', 'components'), { recursive: true });
    await mkdir(join(testDir, 'build', 'esm', 'components'), { recursive: true });
    await mkdir(join(testDir, 'build', 'components'), { recursive: true });

    await writeFile(
      join(testDir, 'package.json'),
      JSON.stringify({
        name: 'test-package',
        main: './build/cjs/index.js',
        module: './build/esm/index.js',
      })
    );

    // Create nested component files
    await writeFile(
      join(testDir, 'build', 'cjs', 'components', 'Button.js'),
      'module.exports = {};'
    );
    await writeFile(join(testDir, 'build', 'esm', 'components', 'Button.js'), 'export {};');
    await writeFile(join(testDir, 'build', 'components', 'Button.d.ts'), 'export {};');

    const pkg: PackageInfo = {
      name: 'test-package',
      path: testDir,
      packageJsonPath: join(testDir, 'package.json'),
    };

    const usage: PackageUsage = {
      package: 'test-package',
      importPaths: ['./build/components/Button.js'],
    };

    const result = await generateExportsMap(pkg, usage);

    expect(result['./build/components/Button.js']).toEqual({
      types: './build/components/Button.d.ts',
      import: './build/esm/components/Button.js',
      require: './build/cjs/components/Button.js',
      default: './build/esm/components/Button.js',
    });
  });
});
