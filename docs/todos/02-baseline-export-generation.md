# Work Item 02: Baseline Export Generation

## Overview
Rewrite the baseline export generation logic to properly handle `main`, `module`, and `browser` fields according to the specification requirements.

## Current Behavior
Current implementation in `src/fix.ts` has basic export generation:

```typescript
function generateBaselineExports(exportsMap: ExportsMap, packageJson: Record<string, unknown>): void {
  const rootExport: Record<string, string> = {};
  
  // Simple main field handling
  if (packageJson.main && typeof packageJson.main === 'string') {
    const mainPath = packageJson.main.startsWith('./') ? packageJson.main : `./${packageJson.main}`;
    rootExport.default = mainPath;
    if (!packageJson.module) {
      rootExport.require = mainPath;
    }
  }
  // ... basic module handling
}
```

## Target Behavior
According to the spec, we need sophisticated baseline generation:

1. **Main field**: Typically CommonJS, translate to `.` entry with `default` condition (and `require` if safe)
2. **Module field**: Always ESM, translate to `.` entry with `import` condition  
3. **Browser field**: Complex handling for both string and object formats
4. **Module type detection**: Use source detection to infer actual module type

## Implementation Requirements

### 1. Enhanced Main Field Handling
```typescript
// Current: Simple default assignment
// Target: Smart module type detection + proper conditions
```

- Detect if main file is actually CommonJS or ESM
- Set appropriate `require`/`default` conditions
- Handle cases where main doesn't exist

### 2. Module Field Processing
```typescript
// Always ESM, should map to import condition
if (packageJson.module) {
  rootExport.import = normalizeRelativePath(packageJson.module);
}
```

### 3. Browser Field Complex Logic
Per spec requirements:

**String browser fields:**
```json
{ "browser": "./lib/browser.js" }
// → exports["."].browser = "./lib/browser.js"
```

**Object browser fields:**
```json
{ 
  "browser": {
    "./lib/index.js": "./lib/browser.js",
    "./lib/node-only.js": false
  }
}
```

Logic:
- If key matches `main` or `module` → maps to `.` entry with `browser` condition
- Otherwise → treat key as export entry with `browser` condition
- Handle `false` values (blocked in browser)

### 4. Module Type Detection
```typescript
async function detectModuleType(filePath: string): Promise<'esm' | 'cjs' | 'unknown'> {
  // 1. Check file extension (.mjs = esm, .cjs = cjs)
  // 2. Check package.json "type" field
  // 3. Static analysis of file content (import/require patterns)
  // 4. Return 'unknown' if can't determine
}
```

## Technical Approach

### File Changes Required
1. `src/fix.ts` - Complete rewrite of `generateBaselineExports`
2. `src/fix.ts` - Add module type detection utilities
3. `src/fix.ts` - Add browser field parsing logic

### New Functions Needed
```typescript
async function detectModuleType(filePath: string, packageDir: string): Promise<'esm' | 'cjs' | 'unknown'>
function parseBrowserField(browserField: string | Record<string, string | false>): ExportConditions
function normalizeRelativePath(path: string): string
function generateBaselineExports(packageJson: any, packageDir: string): Promise<ExportsMap>
```

### Algorithm Flow
1. **Start with empty exports map**
2. **Process main field:**
   - Detect module type
   - Set `default` condition
   - Set `require` condition if CommonJS
3. **Process module field:**
   - Always set `import` condition
4. **Process browser field:**
   - Parse according to string vs object rules
   - Apply browser conditions appropriately
5. **Validate file existence** for all generated paths

## Edge Cases to Consider

1. **Missing files**: Referenced files don't exist
2. **Type field conflicts**: package.json "type" vs actual file content
3. **Browser field complexity**: Multiple browser entries, false values
4. **Path normalization**: Ensure all paths start with "./"
5. **Circular references**: Browser field references itself

## Testing Considerations

### Test Scenarios
1. **Basic cases**: main only, module only, both main+module
2. **Browser string**: Simple browser field as string
3. **Browser object**: Complex browser field mappings
4. **Module types**: ESM files, CJS files, mixed scenarios
5. **Missing files**: Referenced files that don't exist
6. **Edge paths**: Unusual path formats, no leading "./"

### Expected Outputs
```json
{
  ".": {
    "types": "./lib/index.d.ts",
    "import": "./lib/index.mjs", 
    "require": "./lib/index.cjs",
    "browser": "./lib/browser.js",
    "default": "./lib/index.js"
  }
}
```

## Success Criteria

- [ ] Proper main field handling with module type detection
- [ ] Correct module field processing (always import condition)
- [ ] Complete browser field support (string + object formats)
- [ ] File existence validation
- [ ] Backward compatibility with existing packages
- [ ] Comprehensive test coverage for edge cases

## Dependencies
- Work Item 07 (Enhanced File Discovery) - for file existence checks
- May benefit from Work Item 06 (Source Condition Support) integration