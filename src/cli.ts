#!/usr/bin/env node

import { program } from 'commander';
import { evaluateUsage } from './commands/evaluate.js';
import { fixExports } from './commands/fix.js';

program
  .name('exportify')
  .description('CLI tool which helps fix packages in a monorepo upgrade to exports maps')
  .version('1.0.0');

// Evaluate command - scan imports and build usage dictionary
program
  .command('evaluate')
  .description('Scan current repo for imports and build/update usage dictionary')
  .argument('<usage-file>', 'Path to usage.json file to create or update')
  .option('--cwd <path>', 'Working directory to scan', process.cwd())
  .option('--main-repo <path>', 'Main repository directory (where packages are defined)')
  .option('--private-only', 'Only include packages marked as private: true')
  .action(async (usageFile: string, options) => {
    try {
      await evaluateUsage(options.cwd, usageFile, options);
      console.log(`Usage data updated in: ${usageFile}`);
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Fix command - generate exports maps from usage data
program
  .command('fix')
  .description('Generate exports maps for packages using usage dictionary')
  .argument('<usage-file>', 'Path to usage.json file with import data')
  .argument('[package-name]', 'Optional package name to fix only that specific package')
  .option('--cwd <path>', 'Working directory containing packages', process.cwd())
  .option('--dry-run', 'Show what would be generated without writing files')
  .action(async (usageFile: string, packageName: string | undefined, options) => {
    try {
      await fixExports(options.cwd, usageFile, { ...options, packageName });
      if (!options.dryRun) {
        console.log('Exports maps generated successfully');
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program.parse();
