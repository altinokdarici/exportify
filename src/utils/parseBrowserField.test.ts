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

  it('handles object browser field', () => {
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
});
