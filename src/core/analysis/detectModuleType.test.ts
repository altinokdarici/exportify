import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { detectModuleType } from './detectModuleType.js';

describe('detectModuleType', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(
      tmpdir(),
      `exportmapify-modules-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    );
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('detects ESM from .mjs extension', async () => {
    await writeFile(join(testDir, 'package.json'), JSON.stringify({ name: 'test' }));

    const result = await detectModuleType('./index.mjs', testDir);
    expect(result).toBe('esm');
  });

  it('detects CJS from .cjs extension', async () => {
    await writeFile(join(testDir, 'package.json'), JSON.stringify({ name: 'test' }));

    const result = await detectModuleType('./index.cjs', testDir);
    expect(result).toBe('cjs');
  });

  it('detects ESM from package.json type: module', async () => {
    await writeFile(
      join(testDir, 'package.json'),
      JSON.stringify({
        name: 'test',
        type: 'module',
      })
    );
    await writeFile(join(testDir, 'index.js'), 'console.log("hello");');

    const result = await detectModuleType('./index.js', testDir);
    expect(result).toBe('esm');
  });

  it('detects CJS from package.json type: commonjs', async () => {
    await writeFile(
      join(testDir, 'package.json'),
      JSON.stringify({
        name: 'test',
        type: 'commonjs',
      })
    );
    await writeFile(join(testDir, 'index.js'), 'console.log("hello");');

    const result = await detectModuleType('./index.js', testDir);
    expect(result).toBe('cjs');
  });

  it('detects ESM from import statements', async () => {
    await writeFile(join(testDir, 'package.json'), JSON.stringify({ name: 'test' }));
    await writeFile(
      join(testDir, 'index.js'),
      'import fs from "fs";\nexport const hello = "world";'
    );

    const result = await detectModuleType('./index.js', testDir);
    expect(result).toBe('esm');
  });

  it('detects ESM from export statements', async () => {
    await writeFile(join(testDir, 'package.json'), JSON.stringify({ name: 'test' }));
    await writeFile(join(testDir, 'index.js'), 'export const hello = "world";');

    const result = await detectModuleType('./index.js', testDir);
    expect(result).toBe('esm');
  });

  it('detects ESM from dynamic import', async () => {
    await writeFile(join(testDir, 'package.json'), JSON.stringify({ name: 'test' }));
    await writeFile(join(testDir, 'index.js'), 'const module = await import("./other.js");');

    const result = await detectModuleType('./index.js', testDir);
    expect(result).toBe('esm');
  });

  it('detects CJS from require statements', async () => {
    await writeFile(join(testDir, 'package.json'), JSON.stringify({ name: 'test' }));
    await writeFile(join(testDir, 'index.js'), 'const fs = require("fs");');

    const result = await detectModuleType('./index.js', testDir);
    expect(result).toBe('cjs');
  });

  it('detects CJS from module.exports', async () => {
    await writeFile(join(testDir, 'package.json'), JSON.stringify({ name: 'test' }));
    await writeFile(join(testDir, 'index.js'), 'module.exports = { hello: "world" };');

    const result = await detectModuleType('./index.js', testDir);
    expect(result).toBe('cjs');
  });

  it('detects CJS from exports assignment', async () => {
    await writeFile(join(testDir, 'package.json'), JSON.stringify({ name: 'test' }));
    await writeFile(join(testDir, 'index.js'), 'exports.hello = "world";');

    const result = await detectModuleType('./index.js', testDir);
    expect(result).toBe('cjs');
  });

  it('returns unknown for ambiguous files', async () => {
    await writeFile(join(testDir, 'package.json'), JSON.stringify({ name: 'test' }));
    await writeFile(join(testDir, 'index.js'), 'console.log("hello world");');

    const result = await detectModuleType('./index.js', testDir);
    expect(result).toBe('unknown');
  });

  it('returns unknown for non-existent files', async () => {
    await writeFile(join(testDir, 'package.json'), JSON.stringify({ name: 'test' }));

    const result = await detectModuleType('./nonexistent.js', testDir);
    expect(result).toBe('unknown');
  });
});
