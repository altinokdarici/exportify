# Work Item 04: Source File Inference

## Overview
Implement logic to infer missing lib/dist files from src structure when the compiled output doesn't exist yet, as specified in the edge cases section.

## Current Behavior
Current implementation only looks for existing files and warns if import paths don't exist:

```typescript
const exportEntry = await generateExportEntry(importPath, pkg.path);
if (exportEntry) {
  exportsMap[importPath] = exportEntry;
}
```

## Target Behavior
According to the spec:
> "In an internal repo, the `./lib` folder may not have been built. In that case, we can infer that the file 'should' exist if a corresponding source file in `./src` exists."

## Implementation Requirements

### 1. Source-to-Output Mapping
Create mapping logic between source and output directories:

```typescript
interface SourceMapping {
  sourceDir: string;      // e.g., "src"
  outputDir: string;      // e.g., "lib" | "dist" 
  preserveStructure: boolean; // maintain directory structure
}

const COMMON_MAPPINGS: SourceMapping[] = [
  { sourceDir: 'src', outputDir: 'lib', preserveStructure: true },
  { sourceDir: 'src', outputDir: 'dist', preserveStructure: true },
  { sourceDir: 'source', outputDir: 'lib', preserveStructure: true },
  { sourceDir: 'packages', outputDir: 'lib', preserveStructure: false }
];
```

### 2. File Extension Mapping
Handle TypeScript to JavaScript compilation:

```typescript
interface ExtensionMapping {
  source: string[];
  output: string[];
}

const EXTENSION_MAPPINGS: ExtensionMapping[] = [
  { source: ['.ts', '.tsx'], output: ['.js', '.d.ts'] },
  { source: ['.ts'], output: ['.js', '.mjs', '.cjs', '.d.ts'] },
  { source: ['.tsx'], output: ['.js', '.d.ts'] }
];
```

### 3. Source File Discovery
```typescript
async function findSourceFile(
  requestedPath: string, 
  packageDir: string
): Promise<SourceFileInfo | null> {
  
  // 1. Try direct file access first
  if (await fileExists(path.join(packageDir, requestedPath))) {
    return { type: 'direct', path: requestedPath };
  }
  
  // 2. Try common source mappings
  for (const mapping of COMMON_MAPPINGS) {
    const sourcePath = requestedPath.replace(mapping.outputDir, mapping.sourceDir);
    
    // Try different extensions
    for (const ext of ['.ts', '.tsx', '.js', '.jsx']) {
      const sourceFile = sourcePath + ext;
      if (await fileExists(path.join(packageDir, sourceFile))) {
        return { 
          type: 'inferred', 
          sourcePath: sourceFile,
          outputPath: requestedPath,
          mapping 
        };
      }
    }
    
    // Try index files
    const indexPath = path.join(sourcePath, 'index');
    for (const ext of ['.ts', '.tsx', '.js', '.jsx']) {
      const sourceFile = indexPath + ext;
      if (await fileExists(path.join(packageDir, sourceFile))) {
        return {
          type: 'inferred',
          sourcePath: sourceFile, 
          outputPath: requestedPath,
          mapping
        };
      }
    }
  }
  
  return null;
}
```

### 4. Inferred Export Generation
```typescript
async function generateInferredExport(
  sourceInfo: SourceFileInfo,
  packageDir: string
): Promise<ExportConditions> {
  
  const conditions: ExportConditions = {};
  
  if (sourceInfo.type === 'inferred') {
    // Generate expected output paths based on source file
    const outputPaths = inferOutputPaths(sourceInfo.sourcePath, sourceInfo.mapping);
    
    for (const outputPath of outputPaths) {
      if (outputPath.endsWith('.d.ts')) {
        conditions.types = outputPath;
      } else if (outputPath.endsWith('.mjs')) {
        conditions.import = outputPath;
      } else if (outputPath.endsWith('.cjs')) {
        conditions.require = outputPath;
      } else if (outputPath.endsWith('.js')) {
        conditions.default = outputPath;
      }
    }
    
    // Add source condition
    conditions.source = sourceInfo.sourcePath;
  }
  
  return conditions;
}
```

## Technical Approach

### New Types Needed
```typescript
interface SourceFileInfo {
  type: 'direct' | 'inferred';
  sourcePath?: string;
  outputPath?: string;
  mapping?: SourceMapping;
  path?: string; // for direct type
}

interface ExportConditions {
  types?: string;
  import?: string;
  require?: string;
  browser?: string;
  source?: string;
  default?: string;
}
```

### File Changes Required
1. `src/types.ts` - Add source inference types
2. `src/fix.ts` - Add source file discovery functions
3. `src/fix.ts` - Modify `generateExportEntry` to use inference
4. `src/fix.ts` - Add file existence utilities

### Algorithm Flow
1. **Check for direct file existence** (current behavior)
2. **If not found, try source inference**:
   - Map output path to potential source paths
   - Try different source directories (src, source, etc.)
   - Try different extensions (.ts, .tsx, .js, .jsx)
   - Try index files in directories
3. **Generate export conditions** based on inferred structure
4. **Add source condition** when using inference

## Edge Cases to Consider

1. **Multiple source directories**: src/, source/, packages/
2. **Non-standard build outputs**: Different directory structures
3. **Mixed source types**: TypeScript + JavaScript in same package
4. **Index files**: ./lib/utils → ./src/utils/index.ts
5. **Nested directories**: Preserving directory structure in mapping
6. **Build tool variations**: Different compilation patterns

## Testing Considerations

### Test Scenarios
1. **Standard TypeScript setup**: src/ → lib/ with .ts → .js/.d.ts
2. **Missing lib directory**: Only src/ exists, no compiled output
3. **Mixed source structure**: Some files exist in lib/, others need inference
4. **Index file inference**: Directory imports that map to index files
5. **Non-standard directories**: Custom source/output directory names
6. **Extension variations**: .tsx, .mts, .cts files

### Expected Outputs

**Source file exists but lib doesn't**:
```json
{
  "./lib/utils": {
    "source": "./src/utils.ts",
    "types": "./lib/utils.d.ts", 
    "default": "./lib/utils.js"
  }
}
```

**Index file inference**:
```json
{
  "./lib/components": {
    "source": "./src/components/index.ts",
    "types": "./lib/components/index.d.ts",
    "import": "./lib/components/index.mjs",
    "require": "./lib/components/index.cjs", 
    "default": "./lib/components/index.js"
  }
}
```

## Success Criteria

- [ ] Source file discovery works for standard src/ → lib/ mapping
- [ ] TypeScript to JavaScript extension mapping
- [ ] Index file inference for directory imports
- [ ] Multiple source directory support
- [ ] Graceful fallback when source files don't exist
- [ ] Integration with existing export generation
- [ ] Source conditions added when using inference

## Dependencies
- Work Item 06 (Source Condition Support) - closely related
- Work Item 07 (Enhanced File Discovery) - may share file utilities
- Work Item 02 (Baseline Export Generation) - integrates with baseline logic