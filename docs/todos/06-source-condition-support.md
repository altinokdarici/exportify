# Work Item 06: Source Condition Support

## Overview
Add support for the `source` condition in export maps to help inner-repo tooling identify paths to source files more reliably.

## Current Behavior
Current implementation doesn't generate `source` conditions in export maps.

## Target Behavior
According to the spec:
> "If source is available, we should also add the `source` key to indicate source entries. This helps inner-repo tooling identify paths to source files more reliably."

The `source` condition should point to the original TypeScript/source files when available.

## Implementation Requirements

### 1. Source File Discovery
```typescript
async function findSourceFile(
  targetPath: string, 
  packageDir: string
): Promise<string | null> {
  
  // Common source mappings
  const sourceMappings = [
    { from: '/lib/', to: '/src/' },
    { from: '/dist/', to: '/src/' },
    { from: '/build/', to: '/source/' },
    { from: '/out/', to: '/src/' }
  ];
  
  // Try direct source mapping
  for (const mapping of sourceMappings) {
    if (targetPath.includes(mapping.from)) {
      const sourcePath = targetPath.replace(mapping.from, mapping.to);
      
      // Try different source extensions
      for (const ext of ['.ts', '.tsx', '.js', '.jsx']) {
        const sourceFile = sourcePath.replace(/\.[^.]+$/, ext);
        if (await fileExists(path.join(packageDir, sourceFile))) {
          return sourceFile;
        }
      }
      
      // Try index files
      const indexPath = sourcePath.replace(/\.[^.]+$/, '/index');
      for (const ext of ['.ts', '.tsx', '.js', '.jsx']) {
        const indexFile = indexPath + ext;
        if (await fileExists(path.join(packageDir, indexFile))) {
          return indexFile;
        }
      }
    }
  }
  
  return null;
}
```

### 2. Source Condition Integration
```typescript
async function addSourceCondition(
  exportConditions: ExportConditions,
  exportPath: string,
  packageDir: string
): Promise<ExportConditions> {
  
  // Try to find source file for any of the existing conditions
  const targetPaths = [
    exportConditions.default,
    exportConditions.import,
    exportConditions.require,
    exportConditions.types
  ].filter(Boolean);
  
  for (const targetPath of targetPaths) {
    const sourceFile = await findSourceFile(targetPath!, packageDir);
    if (sourceFile) {
      return {
        source: sourceFile,
        ...exportConditions
      };
    }
  }
  
  return exportConditions;
}
```

### 3. Baseline Source Integration
For the root export (`.`), source should be derived from main/module field analysis:

```typescript
async function addBaselineSourceCondition(
  packageJson: any,
  packageDir: string
): Promise<string | null> {
  
  // Check if package.json has source field
  if (packageJson.source && typeof packageJson.source === 'string') {
    const sourcePath = normalizeRelativePath(packageJson.source);
    if (await fileExists(path.join(packageDir, sourcePath))) {
      return sourcePath;
    }
  }
  
  // Infer from main/module fields
  const mainFile = packageJson.main || packageJson.module;
  if (mainFile) {
    return await findSourceFile(mainFile, packageDir);
  }
  
  // Fallback to common patterns
  const commonSources = [
    './src/index.ts',
    './src/index.tsx', 
    './src/index.js',
    './source/index.ts',
    './index.ts'
  ];
  
  for (const sourcePath of commonSources) {
    if (await fileExists(path.join(packageDir, sourcePath))) {
      return sourcePath;
    }
  }
  
  return null;
}
```

### 4. Export Condition Ordering
Ensure proper condition ordering according to Node.js resolution:

```typescript
function orderExportConditions(conditions: ExportConditions): ExportConditions {
  const orderedConditions: ExportConditions = {};
  
  // Proper condition order for Node.js resolution
  const conditionOrder = ['source', 'types', 'import', 'require', 'browser', 'default'];
  
  for (const condition of conditionOrder) {
    if (conditions[condition as keyof ExportConditions]) {
      orderedConditions[condition as keyof ExportConditions] = 
        conditions[condition as keyof ExportConditions];
    }
  }
  
  return orderedConditions;
}
```

## Technical Approach

### File Changes Required
1. `src/types.ts` - Add `source` to ExportConditions interface
2. `src/fix.ts` - Add source file discovery functions
3. `src/fix.ts` - Integrate source conditions into export generation
4. `src/fix.ts` - Update condition ordering logic

### Updated ExportConditions Interface
```typescript
interface ExportConditions {
  source?: string;
  types?: string;
  import?: string;
  require?: string;
  browser?: string;
  default?: string;
}
```

### Algorithm Flow
1. **Generate base export conditions** (types, import, require, etc.)
2. **For each export entry**:
   - Check if package.json has explicit `source` field
   - Try to map output files back to source files
   - Use common source directory patterns
   - Try different source file extensions
3. **Add source condition** if found
4. **Order conditions properly** for Node.js resolution

## Edge Cases to Consider

1. **Multiple source files**: One output maps to multiple source files
2. **Non-standard source directories**: Custom source locations
3. **Monorepo source structure**: Nested package source files
4. **Missing source files**: Built packages without source
5. **Source-only packages**: Packages that don't compile
6. **Complex build setups**: Source files in unusual locations

## Testing Considerations

### Test Scenarios
1. **Standard TypeScript setup**: src/ directory with .ts files
2. **JavaScript source**: Source files are .js (no compilation)
3. **Multiple source directories**: src/, source/, lib/ as source
4. **Missing source**: Only compiled output exists
5. **Package.json source field**: Explicit source field declaration
6. **Index file mapping**: Directory imports to index.ts files

### Expected Outputs

**Standard setup**:
```json
{
  ".": {
    "source": "./src/index.ts",
    "types": "./lib/index.d.ts",
    "import": "./lib/index.mjs",
    "require": "./lib/index.cjs",
    "default": "./lib/index.js"
  },
  "./lib/utils": {
    "source": "./src/utils.ts",
    "types": "./lib/utils.d.ts",
    "default": "./lib/utils.js"
  }
}
```

**Package.json source field**:
```json
// package.json: { "source": "./source/main.ts" }
{
  ".": {
    "source": "./source/main.ts",
    "types": "./dist/main.d.ts", 
    "default": "./dist/main.js"
  }
}
```

## Success Criteria

- [ ] Source conditions added when source files are discoverable
- [ ] Package.json `source` field respected when present
- [ ] Common source directory patterns supported (src/, source/)
- [ ] TypeScript to JavaScript source mapping works
- [ ] Index file mapping for directory imports
- [ ] Proper export condition ordering maintained
- [ ] No source condition when source files don't exist

## Dependencies
- Work Item 04 (Source File Inference) - shares source file discovery logic
- Work Item 07 (Enhanced File Discovery) - uses file existence utilities
- Work Item 08 (Export Structure Overhaul) - integrates with overall export structure