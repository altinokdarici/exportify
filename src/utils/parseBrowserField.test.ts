import { describe, it, expect } from '@jest/globals';
import { parseBrowserField } from './parseBrowserField.js';

describe('parseBrowserField', () => {
  it('handles string browser field', () => {
    const result = parseBrowserField('lib/browser.js');

    expect(result).toEqual({
      rootBrowser: './lib/browser.js',
      browserMappings: {},
    });
  });

  it('handles string browser field with ./ prefix', () => {
    const result = parseBrowserField('./lib/browser.js');

    expect(result).toEqual({
      rootBrowser: './lib/browser.js',
      browserMappings: {},
    });
  });

  it('handles object browser field without main/module fields', () => {
    const browserField: Record<string, string | false> = {
      './lib/index.js': './lib/browser.js',
      './lib/node-only.js': false,
      'utils/helper.js': './lib/browser-helper.js',
    };

    const result = parseBrowserField(browserField);

    expect(result).toEqual({
      rootBrowser: undefined,
      browserMappings: {
        './lib/index.js': './lib/browser.js',
        './lib/node-only.js': false,
        './utils/helper.js': './lib/browser-helper.js',
      },
    });
  });

  it('normalizes paths in object browser field', () => {
    const browserField: Record<string, string | false> = {
      'lib/index.js': 'lib/browser.js',
      './lib/other.js': './lib/browser-other.js',
    };

    const result = parseBrowserField(browserField);

    expect(result).toEqual({
      rootBrowser: undefined,
      browserMappings: {
        './lib/index.js': './lib/browser.js',
        './lib/other.js': './lib/browser-other.js',
      },
    });
  });

  it('detects main field mapping to root browser export', () => {
    const browserField: Record<string, string | false> = {
      './lib/index.js': './lib/browser.js',
      './lib/utils.js': './lib/browser-utils.js',
    };

    const result = parseBrowserField(browserField, './lib/index.js');

    expect(result).toEqual({
      rootBrowser: './lib/browser.js',
      browserMappings: {
        './lib/utils.js': './lib/browser-utils.js',
      },
    });
  });

  it('detects module field mapping to root browser export', () => {
    const browserField: Record<string, string | false> = {
      './lib/index.esm.js': './lib/browser.esm.js',
      './lib/utils.js': './lib/browser-utils.js',
    };

    const result = parseBrowserField(browserField, undefined, './lib/index.esm.js');

    expect(result).toEqual({
      rootBrowser: './lib/browser.esm.js',
      browserMappings: {
        './lib/utils.js': './lib/browser-utils.js',
      },
    });
  });

  it('prioritizes main over module when both match', () => {
    const browserField: Record<string, string | false> = {
      './lib/index.js': './lib/browser.js',
      './lib/index.esm.js': './lib/browser.esm.js',
      './lib/utils.js': './lib/browser-utils.js',
    };

    const result = parseBrowserField(browserField, './lib/index.js', './lib/index.esm.js');

    expect(result).toEqual({
      rootBrowser: './lib/browser.js',
      browserMappings: {
        './lib/index.esm.js': './lib/browser.esm.js',
        './lib/utils.js': './lib/browser-utils.js',
      },
    });
  });

  it('handles false value for main field mapping', () => {
    const browserField: Record<string, string | false> = {
      './lib/index.js': false,
      './lib/utils.js': './lib/browser-utils.js',
    };

    const result = parseBrowserField(browserField, './lib/index.js');

    expect(result).toEqual({
      rootBrowser: undefined,
      browserMappings: {
        './lib/utils.js': './lib/browser-utils.js',
      },
    });
  });

  it('normalizes main and module fields for comparison', () => {
    const browserField: Record<string, string | false> = {
      './lib/index.js': './lib/browser.js',
      './lib/utils.js': './lib/browser-utils.js',
    };

    // Main field without ./ prefix should still match
    const result = parseBrowserField(browserField, 'lib/index.js');

    expect(result).toEqual({
      rootBrowser: './lib/browser.js',
      browserMappings: {
        './lib/utils.js': './lib/browser-utils.js',
      },
    });
  });

  it('handles complex object browser field with multiple scenarios', () => {
    const browserField: Record<string, string | false> = {
      './lib/index.js': './lib/browser.js', // main field replacement
      './lib/node-only.js': false, // blocked in browser
      './lib/utils.js': './lib/browser-utils.js', // separate export
      'server/handler.js': false, // blocked server module
    };

    const result = parseBrowserField(browserField, './lib/index.js');

    expect(result).toEqual({
      rootBrowser: './lib/browser.js',
      browserMappings: {
        './lib/node-only.js': false,
        './lib/utils.js': './lib/browser-utils.js',
        './server/handler.js': false,
      },
    });
  });
});
