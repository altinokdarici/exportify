# Work Item 08: Export Structure Overhaul

## Overview
Update the export generation to match the specification's comprehensive conditional export structure, integrating all the previous work items into a cohesive export map generation system.

## Current Behavior
Current implementation generates basic exports:

```json
{
  ".": {
    "types": "./lib/index.d.ts",
    "default": "./lib/index.js"
  }
}
```

## Target Behavior
According to the spec, generate comprehensive conditional exports:

```json
{
  ".": {
    "source": "./src/index.ts",
    "types": "./lib/index.d.ts", 
    "import": "./lib/index.js",
    "require": "./lib/index.cjs",
    "browser": "./lib/index.browser.js",
    "default": "./lib/index.js"
  }
}
```

## Implementation Requirements

### 1. Unified Export Generation Pipeline
```typescript
interface ExportGenerationContext {
  packageJson: any;
  packageDir: string;
  usageData: PackageUsage;
  buildDelta?: BuildDelta;
  buildStructure: BuildStructure;
}

interface GeneratedExport {
  entryPoint: string;
  conditions: ExportConditions;
  source: 'baseline' | 'usage' | 'inferred';
}

async function generateComprehensiveExports(
  context: ExportGenerationContext
): Promise<ExportsMap> {
  
  const exports: GeneratedExport[] = [];
  
  // 1. Generate baseline exports from package.json fields
  const baselineExports = await generateBaselineExports(context);
  exports.push(...baselineExports);
  
  // 2. Generate usage-based exports
  const usageExports = await generateUsageBasedExports(context);
  exports.push(...usageExports);
  
  // 3. Apply delta expansion if applicable
  const expandedExports = await applyDeltaExpansion(exports, context);
  
  // 4. Merge and deduplicate exports
  const mergedExports = mergeExportEntries(expandedExports);
  
  // 5. Convert to final ExportsMap format
  return convertToExportsMap(mergedExports);
}
```

### 2. Baseline Export Generation (Integration of Work Item 02)
```typescript
async function generateBaselineExports(
  context: ExportGenerationContext
): Promise<GeneratedExport[]> {
  
  const { packageJson, packageDir } = context;
  const exports: GeneratedExport[] = [];
  
  // Generate root export from main/module/browser fields
  const rootConditions = await generateRootExportConditions(packageJson, packageDir);
  if (Object.keys(rootConditions).length > 0) {
    exports.push({
      entryPoint: '.',
      conditions: rootConditions,
      source: 'baseline'
    });
  }
  
  return exports;
}

async function generateRootExportConditions(
  packageJson: any,
  packageDir: string
): Promise<ExportConditions> {
  
  const conditions: ExportConditions = {};
  
  // Source condition (Work Item 06)
  const sourceFile = await findBaselineSourceFile(packageJson, packageDir);
  if (sourceFile) {
    conditions.source = sourceFile;
  }
  
  // Types condition
  if (packageJson.types) {
    conditions.types = normalizeRelativePath(packageJson.types);
  }
  
  // Import condition (from module field)
  if (packageJson.module) {
    conditions.import = normalizeRelativePath(packageJson.module);
  }
  
  // Require condition (from main field if CommonJS)
  if (packageJson.main) {
    const moduleType = await detectModuleType(packageJson.main, packageDir);
    if (moduleType === 'cjs') {
      conditions.require = normalizeRelativePath(packageJson.main);
    }
    conditions.default = normalizeRelativePath(packageJson.main);
  }
  
  // Browser condition (Work Item 03)
  const browserConditions = await parseBrowserField(packageJson.browser, packageJson);
  Object.assign(conditions, browserConditions);
  
  return orderExportConditions(conditions);
}
```

### 3. Usage-Based Export Generation
```typescript
async function generateUsageBasedExports(
  context: ExportGenerationContext
): Promise<GeneratedExport[]> {
  
  const { usageData, packageDir } = context;
  const exports: GeneratedExport[] = [];
  
  for (const importPath of usageData.importPaths) {
    if (importPath === '.') continue; // Skip root, handled by baseline
    
    // Discover actual files for this import path
    const discoveredFile = await discoverFile(importPath, packageDir, {
      extensions: ['.js', '.mjs', '.cjs', '.ts', '.tsx'],
      includeIndex: true,
      checkDeclarations: true
    });
    
    if (discoveredFile) {
      const conditions = await generateFileBasedConditions(discoveredFile, packageDir);
      exports.push({
        entryPoint: importPath,
        conditions,
        source: 'usage'
      });
    } else {
      // Try source file inference (Work Item 04)
      const inferredConditions = await trySourceFileInference(importPath, packageDir);
      if (inferredConditions) {
        exports.push({
          entryPoint: importPath,
          conditions: inferredConditions,
          source: 'inferred'
        });
      }
    }
  }
  
  return exports;
}
```

### 4. Delta Expansion Integration (Work Item 05)
```typescript
async function applyDeltaExpansion(
  exports: GeneratedExport[],
  context: ExportGenerationContext
): Promise<GeneratedExport[]> {
  
  if (!context.buildDelta?.hasMultipleBuilds) {
    return exports;
  }
  
  const expandedExports: GeneratedExport[] = [...exports];
  
  for (const exportEntry of exports) {
    if (exportEntry.source === 'usage') {
      // Apply delta expansion to usage-based exports
      const deltaVariants = await generateDeltaVariants(exportEntry, context);
      expandedExports.push(...deltaVariants);
    }
  }
  
  return expandedExports;
}

async function generateDeltaVariants(
  exportEntry: GeneratedExport,
  context: ExportGenerationContext
): Promise<GeneratedExport[]> {
  
  const { buildDelta, packageDir } = context;
  const variants: GeneratedExport[] = [];
  
  if (!buildDelta) return variants;
  
  // Generate CJS variant
  if (buildDelta.cjsPattern) {
    const cjsPath = applyDeltaPattern(exportEntry.entryPoint, buildDelta.cjsPattern);
    if (await fileExists(path.join(packageDir, cjsPath))) {
      const cjsConditions = { ...exportEntry.conditions };
      cjsConditions.require = cjsPath;
      variants.push({
        entryPoint: exportEntry.entryPoint,
        conditions: cjsConditions,
        source: 'usage'
      });
    }
  }
  
  // Generate ESM variant
  if (buildDelta.esmPattern) {
    const esmPath = applyDeltaPattern(exportEntry.entryPoint, buildDelta.esmPattern);
    if (await fileExists(path.join(packageDir, esmPath))) {
      const esmConditions = { ...exportEntry.conditions };
      esmConditions.import = esmPath;
      variants.push({
        entryPoint: exportEntry.entryPoint,
        conditions: esmConditions,
        source: 'usage'
      });
    }
  }
  
  return variants;
}
```

### 5. Export Merging and Deduplication
```typescript
function mergeExportEntries(exports: GeneratedExport[]): GeneratedExport[] {
  const mergedMap = new Map<string, ExportConditions>();
  
  for (const exportEntry of exports) {
    const existing = mergedMap.get(exportEntry.entryPoint);
    
    if (existing) {
      // Merge conditions, with priority order
      const merged = mergeExportConditions(existing, exportEntry.conditions);
      mergedMap.set(exportEntry.entryPoint, merged);
    } else {
      mergedMap.set(exportEntry.entryPoint, exportEntry.conditions);
    }
  }
  
  return Array.from(mergedMap.entries()).map(([entryPoint, conditions]) => ({
    entryPoint,
    conditions,
    source: 'merged' as const
  }));
}

function mergeExportConditions(
  existing: ExportConditions,
  incoming: ExportConditions
): ExportConditions {
  
  const merged = { ...existing };
  
  // Merge conditions with precedence rules
  const precedence = ['source', 'types', 'import', 'require', 'browser', 'default'];
  
  for (const condition of precedence) {
    const key = condition as keyof ExportConditions;
    if (incoming[key] && !merged[key]) {
      merged[key] = incoming[key];
    }
  }
  
  return orderExportConditions(merged);
}
```

### 6. Final Export Map Generation
```typescript
function convertToExportsMap(exports: GeneratedExport[]): ExportsMap {
  const exportsMap: ExportsMap = {};
  
  for (const exportEntry of exports) {
    const { entryPoint, conditions } = exportEntry;
    
    // Convert conditions object to export map format
    if (Object.keys(conditions).length === 1 && conditions.default) {
      // Single condition can be a string
      exportsMap[entryPoint] = conditions.default;
    } else {
      // Multiple conditions as object
      exportsMap[entryPoint] = { ...conditions };
    }
  }
  
  return exportsMap;
}
```

## Technical Approach

### File Changes Required
1. `src/fix.ts` - Complete rewrite of `generateExportsMap` function
2. `src/fix.ts` - Integration of all work item functionalities
3. `src/types.ts` - Add comprehensive export generation types
4. `src/fix.ts` - Update export condition ordering and merging

### Integration Points
This work item integrates ALL previous work items:
- **Work Item 01**: Version tracking (context data)
- **Work Item 02**: Baseline export generation
- **Work Item 03**: Browser field handling
- **Work Item 04**: Source file inference
- **Work Item 05**: CJS/ESM delta logic
- **Work Item 06**: Source condition support
- **Work Item 07**: Enhanced file discovery

### Algorithm Flow
1. **Context preparation**: Gather all package information
2. **Baseline generation**: Create exports from package.json fields
3. **Usage analysis**: Generate exports from usage data
4. **Source inference**: Fill gaps with inferred source files
5. **Delta expansion**: Apply build pattern expansion
6. **Merging**: Combine and deduplicate export entries
7. **Finalization**: Convert to final exports map format

## Edge Cases to Consider

1. **Conflicting conditions**: Multiple sources defining same condition
2. **Circular dependencies**: Export conditions referencing each other
3. **Invalid paths**: Export paths that don't exist
4. **Empty exports**: Packages with no valid exports
5. **Condition ordering**: Proper Node.js resolution order
6. **Performance**: Large packages with many exports

## Testing Considerations

### Test Scenarios
1. **Complete integration**: All work items working together
2. **Baseline only**: Packages without usage data
3. **Usage only**: Packages without baseline fields
4. **Complex scenarios**: Multiple build outputs, browser fields, source inference
5. **Edge cases**: Missing files, invalid configurations
6. **Performance**: Large monorepos with many packages

### Expected Outputs

**Complete export map**:
```json
{
  ".": {
    "source": "./src/index.ts",
    "types": "./lib/index.d.ts",
    "import": "./lib/esm/index.js",
    "require": "./lib/cjs/index.js",
    "browser": "./lib/browser/index.js",
    "default": "./lib/index.js"
  },
  "./lib/utils": {
    "source": "./src/utils.ts",
    "types": "./lib/utils.d.ts",
    "import": "./lib/esm/utils.js",
    "require": "./lib/cjs/utils.js",
    "default": "./lib/utils.js"
  }
}
```

## Success Criteria

- [ ] Integration of all previous work items
- [ ] Comprehensive export condition generation
- [ ] Proper condition ordering and merging
- [ ] Performance suitable for large monorepos
- [ ] Backward compatibility with existing exports
- [ ] Comprehensive test coverage
- [ ] Clear error handling and warnings

## Dependencies
- **Requires ALL previous work items (01-07)** to be completed first
- **Final integration point** for the entire specification implementation