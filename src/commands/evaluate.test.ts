import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { writeFile, mkdir, rm, readFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { evaluateUsage } from './evaluate.js';
import type { UsageData } from '../types.js';

describe('evaluateUsage', () => {
  let testDir: string;
  let usageFile: string;

  beforeEach(async () => {
    testDir = join(
      tmpdir(),
      `exportmapify-evaluate-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    );
    await mkdir(testDir, { recursive: true });
    usageFile = join(testDir, 'usage.json');
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('tracks internal packages only in single-repo mode', async () => {
    // Create main package.json (root of monorepo) with dependencies
    const rootPackageJson = {
      name: 'monorepo-root',
      version: '1.0.0',
      private: true,
      dependencies: {
        '@company/ui': '^1.0.0',
        '@company/utils': '^1.0.0',
        lodash: '^4.17.21', // External dependency - should be ignored
        react: '^18.0.0', // External dependency - should be ignored
      },
    };
    await writeFile(join(testDir, 'package.json'), JSON.stringify(rootPackageJson, null, 2));

    // Create internal packages structure
    await mkdir(join(testDir, 'packages', 'ui'), { recursive: true });
    await mkdir(join(testDir, 'packages', 'utils'), { recursive: true });

    // Create @company/ui package
    const uiPackageJson = {
      name: '@company/ui',
      version: '1.0.0',
      main: './lib/index.js',
    };
    await writeFile(
      join(testDir, 'packages', 'ui', 'package.json'),
      JSON.stringify(uiPackageJson, null, 2)
    );

    // Create @company/utils package
    const utilsPackageJson = {
      name: '@company/utils',
      version: '1.0.0',
      main: './lib/index.js',
    };
    await writeFile(
      join(testDir, 'packages', 'utils', 'package.json'),
      JSON.stringify(utilsPackageJson, null, 2)
    );

    // Create source file with mixed imports (internal + external)
    await writeFile(
      join(testDir, 'src.ts'),
      `
import { Button } from '@company/ui';
import { formatDate } from '@company/utils/date';
import _ from 'lodash';  // External - should be ignored
import React from 'react';  // External - should be ignored
`
    );

    await evaluateUsage(testDir, usageFile);

    // Read and verify usage data
    const usageContent = await readFile(usageFile, 'utf-8');
    const usageData: UsageData = JSON.parse(usageContent);

    // Should only track internal packages
    expect(usageData['@company/ui']).toEqual({
      package: '@company/ui',
      versionRequirement: '^1.0.0',
      importPaths: ['.'],
    });

    expect(usageData['@company/utils']).toEqual({
      package: '@company/utils',
      versionRequirement: '^1.0.0',
      importPaths: ['./date'],
    });

    // Should NOT track external packages
    expect(usageData.lodash).toBeUndefined();
    expect(usageData.react).toBeUndefined();
  });

  it('ignores external packages even if in dependencies', async () => {
    // Create a monorepo with one internal package
    const rootPackageJson = {
      name: 'monorepo-root',
      version: '1.0.0',
      private: true,
      dependencies: {
        '@company/core': '^1.0.0',
        'external-package': '^1.0.0', // External - should be ignored
      },
    };
    await writeFile(join(testDir, 'package.json'), JSON.stringify(rootPackageJson, null, 2));

    // Create one internal package
    await mkdir(join(testDir, 'packages', 'core'), { recursive: true });
    const corePackageJson = {
      name: '@company/core',
      version: '1.0.0',
    };
    await writeFile(
      join(testDir, 'packages', 'core', 'package.json'),
      JSON.stringify(corePackageJson, null, 2)
    );

    // Create source file importing both
    await writeFile(
      join(testDir, 'src.ts'),
      `
import { config } from '@company/core';
import something from 'external-package';  // Should be ignored
`
    );

    await evaluateUsage(testDir, usageFile);

    const usageContent = await readFile(usageFile, 'utf-8');
    const usageData: UsageData = JSON.parse(usageContent);

    // Should only track internal package
    expect(usageData['@company/core']).toEqual({
      package: '@company/core',
      versionRequirement: '^1.0.0',
      importPaths: ['.'],
    });

    // Should NOT track external package even though it's in dependencies
    expect(usageData['external-package']).toBeUndefined();
  });

  it('handles scoped internal packages correctly', async () => {
    // Create monorepo root
    const rootPackageJson = {
      name: 'monorepo-root',
      version: '1.0.0',
      private: true,
      dependencies: {
        '@company/auth': '^2.0.0',
      },
    };
    await writeFile(join(testDir, 'package.json'), JSON.stringify(rootPackageJson, null, 2));

    // Create scoped internal package
    await mkdir(join(testDir, 'packages', 'auth'), { recursive: true });
    const authPackageJson = {
      name: '@company/auth',
      version: '2.0.0',
    };
    await writeFile(
      join(testDir, 'packages', 'auth', 'package.json'),
      JSON.stringify(authPackageJson, null, 2)
    );

    // Create source file with deep import
    await writeFile(
      join(testDir, 'src.ts'),
      `import { validateToken } from '@company/auth/lib/jwt';`
    );

    await evaluateUsage(testDir, usageFile);

    const usageContent = await readFile(usageFile, 'utf-8');
    const usageData: UsageData = JSON.parse(usageContent);

    expect(usageData['@company/auth']).toEqual({
      package: '@company/auth',
      versionRequirement: '^2.0.0',
      importPaths: ['./lib/jwt'],
    });
  });

  it('preserves existing usage data when scanning additional files', async () => {
    // Create initial usage file with existing internal package data
    const existingUsage: UsageData = {
      '@company/existing': {
        package: '@company/existing',
        versionRequirement: '^1.0.0',
        importPaths: ['./utils'],
      },
    };
    await writeFile(usageFile, JSON.stringify(existingUsage, null, 2));

    // Create monorepo with packages
    const rootPackageJson = {
      name: 'monorepo-root',
      version: '1.0.0',
      private: true,
      dependencies: {
        '@company/existing': '^1.0.0',
        '@company/new': '^2.0.0',
      },
    };
    await writeFile(join(testDir, 'package.json'), JSON.stringify(rootPackageJson, null, 2));

    // Create both packages
    await mkdir(join(testDir, 'packages', 'existing'), { recursive: true });
    await mkdir(join(testDir, 'packages', 'new'), { recursive: true });

    const existingPackageJson = {
      name: '@company/existing',
      version: '1.0.0',
    };
    await writeFile(
      join(testDir, 'packages', 'existing', 'package.json'),
      JSON.stringify(existingPackageJson, null, 2)
    );

    const newPackageJson = {
      name: '@company/new',
      version: '2.0.0',
    };
    await writeFile(
      join(testDir, 'packages', 'new', 'package.json'),
      JSON.stringify(newPackageJson, null, 2)
    );

    // Create source file with new import
    await writeFile(
      join(testDir, 'src.ts'),
      `import { feature } from '@company/new';`
    );

    await evaluateUsage(testDir, usageFile);

    const usageContent = await readFile(usageFile, 'utf-8');
    const usageData: UsageData = JSON.parse(usageContent);

    // Should preserve existing package data
    expect(usageData['@company/existing']).toEqual(existingUsage['@company/existing']);

    // Should add new package data
    expect(usageData['@company/new']).toEqual({
      package: '@company/new',
      versionRequirement: '^2.0.0',
      importPaths: ['.'],
    });
  });

  it('preserves existing version data but adds new import paths', async () => {
    // Create usage file with existing internal package data
    const existingUsage: UsageData = {
      '@company/shared': {
        package: '@company/shared',
        versionRequirement: '^1.0.0',
        importPaths: ['./old-feature'],
      },
    };
    await writeFile(usageFile, JSON.stringify(existingUsage, null, 2));

    // Create monorepo
    const rootPackageJson = {
      name: 'monorepo-root',
      version: '1.0.0',
      private: true,
      dependencies: {
        '@company/shared': '^1.1.0', // Different version requirement
      },
    };
    await writeFile(join(testDir, 'package.json'), JSON.stringify(rootPackageJson, null, 2));

    // Create internal package
    await mkdir(join(testDir, 'packages', 'shared'), { recursive: true });
    const sharedPackageJson = {
      name: '@company/shared',
      version: '1.0.0',
    };
    await writeFile(
      join(testDir, 'packages', 'shared', 'package.json'),
      JSON.stringify(sharedPackageJson, null, 2)
    );

    // Create source file with new import path
    await writeFile(
      join(testDir, 'src.ts'),
      `import { newUtil } from '@company/shared/new-feature';`
    );

    await evaluateUsage(testDir, usageFile);

    const usageContent = await readFile(usageFile, 'utf-8');
    const usageData: UsageData = JSON.parse(usageContent);

    // Should preserve existing version data but add new import path
    expect(usageData['@company/shared']).toEqual({
      package: '@company/shared',
      versionRequirement: '^1.0.0', // Original version requirement preserved
      importPaths: ['./new-feature', './old-feature'], // New import path added and sorted
    });
  });

  describe('cross-repo mode (--main-repo)', () => {
    it('only tracks main-repo packages from consumer repos', async () => {
      // Create main repo structure
      const mainRepoDir = join(testDir, 'main-repo');
      await mkdir(mainRepoDir, { recursive: true });

      const mainRootPackageJson = {
        name: 'main-repo-root',
        version: '1.0.0',
        private: true,
      };
      await writeFile(
        join(mainRepoDir, 'package.json'),
        JSON.stringify(mainRootPackageJson, null, 2)
      );

      // Create main repo packages
      await mkdir(join(mainRepoDir, 'packages', 'core'), { recursive: true });
      await mkdir(join(mainRepoDir, 'packages', 'api'), { recursive: true });

      const corePackageJson = {
        name: '@main/core',
        version: '1.0.0',
      };
      await writeFile(
        join(mainRepoDir, 'packages', 'core', 'package.json'),
        JSON.stringify(corePackageJson, null, 2)
      );

      const apiPackageJson = {
        name: '@main/api',
        version: '1.0.0',
      };
      await writeFile(
        join(mainRepoDir, 'packages', 'api', 'package.json'),
        JSON.stringify(apiPackageJson, null, 2)
      );

      // Create consumer repo structure (scanning directory)
      const consumerRootPackageJson = {
        name: 'consumer-app',
        version: '1.0.0',
        dependencies: {
          '@main/core': '^1.0.0',
          '@main/api': '^1.0.0',
          lodash: '^4.17.21', // External - should be ignored
          '@consumer/local': '^1.0.0', // Local package - should be ignored in cross-repo mode
        },
      };
      await writeFile(
        join(testDir, 'package.json'),
        JSON.stringify(consumerRootPackageJson, null, 2)
      );

      // Create local package in consumer repo
      await mkdir(join(testDir, 'packages', 'local'), { recursive: true });
      const localPackageJson = {
        name: '@consumer/local',
        version: '1.0.0',
      };
      await writeFile(
        join(testDir, 'packages', 'local', 'package.json'),
        JSON.stringify(localPackageJson, null, 2)
      );

      // Create source file importing main-repo, local, and external packages
      await writeFile(
        join(testDir, 'src.ts'),
        `
import { config } from '@main/core';
import { handler } from '@main/api/routes';
import { util } from '@consumer/local';  // Local package - should be ignored
import _ from 'lodash';  // External - should be ignored
`
      );

      // Run in cross-repo mode
      await evaluateUsage(testDir, usageFile, { mainRepo: mainRepoDir });

      const usageContent = await readFile(usageFile, 'utf-8');
      const usageData: UsageData = JSON.parse(usageContent);

      // Should only track main-repo packages
      expect(usageData['@main/core']).toEqual({
        package: '@main/core',
        versionRequirement: '^1.0.0',
        importPaths: ['.'],
      });

      expect(usageData['@main/api']).toEqual({
        package: '@main/api',
        versionRequirement: '^1.0.0',
        importPaths: ['./routes'],
      });

      // Should NOT track local consumer packages or external packages
      expect(usageData['@consumer/local']).toBeUndefined();
      expect(usageData.lodash).toBeUndefined();
    });

    it('handles empty main-repo (no packages found)', async () => {
      // Create empty main repo
      const mainRepoDir = join(testDir, 'empty-main-repo');
      await mkdir(mainRepoDir, { recursive: true });

      const mainRootPackageJson = {
        name: 'empty-repo',
        version: '1.0.0',
        private: true,
      };
      await writeFile(
        join(mainRepoDir, 'package.json'),
        JSON.stringify(mainRootPackageJson, null, 2)
      );

      // Create consumer repo with imports
      const consumerPackageJson = {
        name: 'consumer-app',
        dependencies: {
          '@main/nonexistent': '^1.0.0',
          lodash: '^4.17.21',
        },
      };
      await writeFile(join(testDir, 'package.json'), JSON.stringify(consumerPackageJson, null, 2));

      await writeFile(
        join(testDir, 'src.ts'),
        `
import { something } from '@main/nonexistent';
import _ from 'lodash';
`
      );

      // Run in cross-repo mode with empty main repo
      await evaluateUsage(testDir, usageFile, { mainRepo: mainRepoDir });

      const usageContent = await readFile(usageFile, 'utf-8');
      const usageData: UsageData = JSON.parse(usageContent);

      // Should track nothing since main repo has no packages
      expect(Object.keys(usageData)).toHaveLength(0);
    });
  });
});
