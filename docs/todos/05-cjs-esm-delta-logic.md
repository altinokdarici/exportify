# Work Item 05: CJS/ESM Delta Logic

## Overview
Implement delta-based path expansion using the difference between main and module fields to generate additional export paths from usage data.

## Current Behavior
Current implementation generates exports independently for each usage path without considering the relationship between main/module builds.

## Target Behavior
According to the spec:
> "We can infer this by evaluating the delta between the `import` and `default` entries for `.` in the exports map. If a package has a cjs main and an esm module that have different paths, we can use that delta to expand additional paths caught from the `usage.json` parsing."

## Implementation Requirements

### 1. Delta Detection
Analyze the difference between main and module field paths to understand the build structure:

```typescript
interface BuildDelta {
  hasMultipleBuilds: boolean;
  cjsPattern?: PathPattern;
  esmPattern?: PathPattern; 
  deltaType: 'directory' | 'extension' | 'prefix' | 'none';
}

interface PathPattern {
  directory: string;      // e.g., "lib/cjs", "lib/esm" 
  extension: string;      // e.g., ".js", ".mjs"
  prefix?: string;        // e.g., "index-", "esm-"
}
```

### 2. Delta Analysis Functions
```typescript
function analyzeBuildDelta(packageJson: any): BuildDelta {
  const main = packageJson.main;      // e.g., "./lib/cjs/index.js"
  const module = packageJson.module;  // e.g., "./lib/esm/index.js"
  
  if (!main || !module || main === module) {
    return { hasMultipleBuilds: false, deltaType: 'none' };
  }
  
  // Analyze path differences
  const deltaType = detectDeltaType(main, module);
  const cjsPattern = extractPathPattern(main, deltaType);
  const esmPattern = extractPathPattern(module, deltaType);
  
  return {
    hasMultipleBuilds: true,
    cjsPattern,
    esmPattern,
    deltaType
  };
}

function detectDeltaType(mainPath: string, modulePath: string): 'directory' | 'extension' | 'prefix' | 'none' {
  // "./lib/cjs/index.js" vs "./lib/esm/index.js" → directory
  // "./lib/index.js" vs "./lib/index.mjs" → extension  
  // "./lib/cjs-index.js" vs "./lib/esm-index.js" → prefix
  
  const mainParts = path.parse(mainPath);
  const moduleParts = path.parse(modulePath);
  
  if (mainParts.dir !== moduleParts.dir) {
    return 'directory';
  } else if (mainParts.ext !== moduleParts.ext) {
    return 'extension';
  } else if (mainParts.name !== moduleParts.name) {
    return 'prefix';
  }
  
  return 'none';
}
```

### 3. Path Expansion Using Delta
```typescript
function expandUsagePathsWithDelta(
  usageImportPaths: string[],
  buildDelta: BuildDelta
): ExpandedPaths[] {
  
  if (!buildDelta.hasMultipleBuilds) {
    return usageImportPaths.map(p => ({ original: p, expanded: [p] }));
  }
  
  const expandedPaths: ExpandedPaths[] = [];
  
  for (const usagePath of usageImportPaths) {
    const expanded = {
      original: usagePath,
      expanded: [usagePath] // Always include original
    };
    
    // Apply delta transformation to generate additional paths
    switch (buildDelta.deltaType) {
      case 'directory':
        expanded.expanded.push(
          ...applyDirectoryDelta(usagePath, buildDelta)
        );
        break;
      case 'extension':
        expanded.expanded.push(
          ...applyExtensionDelta(usagePath, buildDelta)
        );
        break;
      case 'prefix':
        expanded.expanded.push(
          ...applyPrefixDelta(usagePath, buildDelta)
        );
        break;
    }
    
    expandedPaths.push(expanded);
  }
  
  return expandedPaths;
}
```

### 4. Delta Application Functions
```typescript
function applyDirectoryDelta(usagePath: string, delta: BuildDelta): string[] {
  // Usage: "./lib/utils.js"
  // CJS pattern: "./lib/cjs/..."  
  // ESM pattern: "./lib/esm/..."
  // Result: ["./lib/cjs/utils.js", "./lib/esm/utils.js"]
  
  const results: string[] = [];
  
  if (delta.cjsPattern) {
    const cjsPath = usagePath.replace('/lib/', `/lib/${delta.cjsPattern.directory}/`);
    results.push(cjsPath);
  }
  
  if (delta.esmPattern) {
    const esmPath = usagePath.replace('/lib/', `/lib/${delta.esmPattern.directory}/`);
    results.push(esmPath);
  }
  
  return results;
}

function applyExtensionDelta(usagePath: string, delta: BuildDelta): string[] {
  // Usage: "./lib/utils.js"
  // CJS: ".js", ESM: ".mjs"
  // Result: ["./lib/utils.js", "./lib/utils.mjs"]
  
  const results: string[] = [];
  const basePath = usagePath.replace(/\.[^.]+$/, '');
  
  if (delta.cjsPattern?.extension) {
    results.push(basePath + delta.cjsPattern.extension);
  }
  
  if (delta.esmPattern?.extension) {
    results.push(basePath + delta.esmPattern.extension);
  }
  
  return results;
}
```

## Technical Approach

### New Types Needed
```typescript
interface ExpandedPaths {
  original: string;
  expanded: string[];
}

interface PathTransformation {
  usagePath: string;
  cjsPath?: string;
  esmPath?: string;
  conditions: ExportConditions;
}
```

### File Changes Required
1. `src/types.ts` - Add delta analysis types
2. `src/fix.ts` - Add delta detection and analysis functions  
3. `src/fix.ts` - Modify export generation to use expanded paths
4. `src/fix.ts` - Integrate with `generateExportsMap`

### Algorithm Flow
1. **Analyze package.json** for main/module delta
2. **Detect delta pattern** (directory, extension, prefix)
3. **For each usage import path**:
   - Apply delta transformation
   - Generate multiple file paths (CJS + ESM variants)
   - Create export conditions for each variant
4. **Validate file existence** for generated paths
5. **Merge into exports map** with appropriate conditions

## Edge Cases to Consider

1. **No delta**: main === module (single build)
2. **Complex deltas**: Multiple directory levels, unusual patterns
3. **Partial deltas**: Only some files follow the pattern
4. **Missing builds**: Delta suggests files that don't exist
5. **Nested patterns**: ./lib/cjs/subdir vs ./lib/esm/subdir
6. **Mixed patterns**: Some files use directory delta, others don't

## Testing Considerations

### Test Scenarios
1. **Directory delta**: ./lib/cjs vs ./lib/esm
2. **Extension delta**: .js vs .mjs
3. **Prefix delta**: cjs-file.js vs esm-file.js  
4. **No delta**: Single build setup
5. **Complex usage paths**: Deep imports with delta application
6. **Missing files**: Delta generates non-existent paths

### Expected Outputs

**Directory delta example**:
```json
// Package: main: "./lib/cjs/index.js", module: "./lib/esm/index.js"
// Usage: ["./lib/utils.js"]
{
  "./lib/utils": {
    "require": "./lib/cjs/utils.js",
    "import": "./lib/esm/utils.js", 
    "default": "./lib/utils.js"
  }
}
```

**Extension delta example**:
```json
// Package: main: "./lib/index.js", module: "./lib/index.mjs"  
// Usage: ["./lib/utils.js"]
{
  "./lib/utils": {
    "require": "./lib/utils.js",
    "import": "./lib/utils.mjs",
    "default": "./lib/utils.js"
  }
}
```

## Success Criteria

- [ ] Delta detection works for directory, extension, and prefix patterns
- [ ] Usage paths correctly expanded using detected delta
- [ ] Multiple build outputs properly mapped to export conditions
- [ ] File existence validation for expanded paths
- [ ] Graceful handling when delta doesn't apply
- [ ] Integration with existing export generation logic
- [ ] Comprehensive test coverage for delta patterns

## Dependencies
- Work Item 02 (Baseline Export Generation) - provides the main/module analysis foundation
- Work Item 07 (Enhanced File Discovery) - for validating expanded file paths
- Work Item 04 (Source File Inference) - may interact with inferred paths