# Claude Development Guide

This file contains essential information for working with this codebase using Claude.

## Project Overview

**Exportmapify** is a CLI tool that helps monorepos upgrade to package.json exports maps by:
1. Scanning repositories for package imports (deep imports)
2. Generating proper exports maps based on actual usage patterns

## Architecture

The codebase follows single responsibility principle with function-based file naming:

```
src/
├── commands/           # Command handlers
│   ├── evaluate.ts     # evaluateUsage() - scan imports command
│   └── fix.ts          # fixExports() - generate exports command
├── core/              # Core business logic
│   ├── analysis/
│   │   ├── analyzeFileImports.ts    # analyzeFileImports(), extractVersionRequirement()
│   │   └── detectModuleType.ts      # detectModuleType(), ModuleType
│   ├── exports/
│   │   ├── generateBaselineExports.ts # generateBaselineExports()
│   │   └── generateExportsMap.ts      # generateExportsMap()
│   └── packages/
│       ├── findPackages.ts          # findPackages(), discoverMainRepoPackages()
│       └── generateExportEntry.ts   # generateExportEntry()
├── utils/             # Generic utilities
│   ├── normalizeRelativePath.ts     # normalizeRelativePath()
│   └── parseBrowserField.ts         # parseBrowserField(), BrowserFieldResult
├── types.ts           # Shared TypeScript types
└── cli.ts             # CLI entry point
```

## Key Commands

### Development
```bash
# Build TypeScript
npm run build

# Run in development mode
npm run dev

# Type checking
npm run typecheck

# Linting
npm run lint
npm run lint:fix

# Formatting
npm run format
npm run format:check

# Testing
npm test
```

### CLI Usage
```bash
# Scan repository for imports
exportmapify evaluate usage.json --cwd /path/to/repo

# Generate exports maps
exportmapify fix usage.json --cwd /path/to/repo

# Preview changes without writing
exportmapify fix usage.json --dry-run

# Fix specific package only
exportmapify fix usage.json my-package-name
```

## Core Concepts

### 1. Usage Analysis (`evaluate` command)
- Scans TypeScript/JavaScript files for import statements
- Extracts package names and import paths
- Builds usage dictionary tracking how packages are imported
- Supports cross-repository analysis with `--main-repo` flag

### 2. Export Generation (`fix` command)
- Generates baseline exports from package.json fields (main, module, browser, types)
- Adds usage-based exports for discovered import paths
- Handles complex browser field mappings and module type detection
- Updates package.json files with proper exports maps

### 3. Module Type Detection
- Detects ESM vs CommonJS based on file extensions (.mjs/.cjs)
- Analyzes package.json "type" field
- Performs static analysis of file content (import/export vs require/module.exports)
- Used for generating appropriate export conditions

### 4. Browser Field Handling
- Supports both string and object browser field formats
- Handles main/module field replacements vs separate entries
- Processes `false` values for browser-blocked modules
- Generates proper browser conditions in exports

## Testing Guidelines

### Test Structure
- Tests are co-located with source files (e.g., `foo.ts` + `foo.test.ts`)
- Test descriptions use direct language without "should" (e.g., "handles ESM files" not "should handle ESM files")
- Uses Jest with ESM and TypeScript support

### Test Categories
1. **Unit tests**: Individual function testing with mocked dependencies
2. **Integration tests**: Command-level testing with temporary file systems
3. **Edge case tests**: Error conditions, missing files, complex scenarios

### Running Tests
```bash
npm test                    # Run all tests
npm test -- --watch        # Watch mode
npm test -- --coverage     # With coverage report
```

## Code Quality Standards

### TypeScript
- Strict type checking enabled
- All exports must have proper type annotations
- No `any` types allowed (use specific types or `unknown`)

### ESLint + Prettier
- ESLint enforces code quality rules
- Prettier handles formatting automatically
- Pre-commit hooks ensure consistent style

### File Naming Convention
- Files named after their primary export function
- Use kebab-case for multi-word functions: `generateExportEntry.ts`
- Test files: `functionName.test.ts`

## Common Development Tasks

### Adding New Functionality
1. Create new file named after the main function: `newFeature.ts`
2. Write the function with proper TypeScript types
3. Create corresponding test file: `newFeature.test.ts`
4. Add comprehensive test cases
5. Export from appropriate location (commands/core/utils)
6. Run quality checks: `npm run build && npm run lint && npm test`

### Debugging Import Issues
1. Check file extensions match the imports (.js for TypeScript files)
2. Verify relative paths are correct
3. Ensure all exports are properly typed
4. Use `npm run typecheck` to catch import errors

### Working with Package Discovery
- `findPackages()` discovers all packages in a repository
- `discoverMainRepoPackages()` gets package names for cross-repo analysis
- Both functions ignore `node_modules`, `dist`, `build` directories

### Understanding Export Generation
1. **Baseline exports**: Generated from package.json fields (main, module, browser, types)
2. **Usage-based exports**: Added for import paths found during analysis
3. **Conditional exports**: Proper ordering (types, import, require, browser, default)

## Troubleshooting

### Build Issues
- Run `npm run typecheck` to see detailed TypeScript errors
- Check import paths use `.js` extensions (not `.ts`)
- Verify all dependencies are properly typed

### Test Failures
- Use `npm test -- --verbose` for detailed output
- Check temporary file cleanup in test `afterEach` hooks
- Ensure test isolation with unique temporary directories

### Linting Errors
- Run `npm run lint:fix` to auto-fix most issues
- Use `npm run format` to apply Prettier formatting
- Check ESLint configuration for project-specific rules

## Dependencies

### Core Dependencies
- **commander**: CLI argument parsing
- **glob**: File pattern matching for package/source discovery

### Development Dependencies
- **TypeScript**: Type checking and compilation
- **Jest + ts-jest**: Testing framework with TypeScript support
- **ESLint + Prettier**: Code quality and formatting
- **tsx**: Development server for TypeScript execution

## File Change Impact Analysis

When modifying files, consider these dependencies:

- **types.ts**: Affects all files using shared interfaces
- **Command files**: Only affect CLI interface, safe to modify
- **Core analysis files**: May affect both commands, test thoroughly
- **Utils**: Used throughout codebase, verify no breaking changes

## Performance Considerations

- **Large repositories**: Use `--main-repo` flag to limit scope
- **File scanning**: Optimized with glob patterns and ignore lists
- **Regex performance**: Import regex is pre-compiled for efficiency
- **Parallel processing**: Multiple files processed concurrently

## Security Notes

- Never commit secrets or API keys
- Validate all file paths to prevent directory traversal
- Use proper file permissions when creating temporary files
- Be cautious with dynamic imports and file system operations