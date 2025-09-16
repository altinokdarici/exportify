# Work Item 03: Browser Field Handling

## Overview
Implement comprehensive browser field parsing to handle both string and object formats according to the specification requirements.

## Current Behavior
Current implementation doesn't handle browser fields at all.

## Target Behavior
According to the spec, browser field handling is complex:

### String Browser Fields
```json
{
  "name": "my-package",
  "main": "./lib/index.js",
  "browser": "./lib/browser.js"
}
```
**Result**: Browser field becomes the `.` entry with `browser` condition.

### Object Browser Fields
```json
{
  "name": "my-package", 
  "main": "./lib/index.js",
  "module": "./lib/index.esm.js",
  "browser": {
    "./lib/index.js": "./lib/browser.js",
    "./lib/node-only.js": false,
    "./lib/utils.js": "./lib/browser-utils.js"
  }
}
```

**Logic**:
- If key matches `main` or `module` → maps to `.` entry with `browser` condition
- Otherwise → treat key as separate export entry with `browser` condition  
- Handle `false` values (blocked/unavailable in browser)

## Implementation Requirements

### 1. Browser Field Detection
```typescript
function hasBrowserField(packageJson: any): boolean {
  return packageJson.browser && 
    (typeof packageJson.browser === 'string' || typeof packageJson.browser === 'object');
}
```

### 2. String Browser Field Processing
```typescript
function processStringBrowserField(browserField: string): BrowserCondition {
  return {
    entryPoint: '.',
    condition: 'browser',
    path: normalizeRelativePath(browserField)
  };
}
```

### 3. Object Browser Field Processing
```typescript
function processObjectBrowserField(
  browserField: Record<string, string | false>,
  packageJson: any
): BrowserMapping[] {
  const mappings: BrowserMapping[] = [];
  
  for (const [key, value] of Object.entries(browserField)) {
    if (value === false) {
      // Handle blocked entries
      continue;
    }
    
    if (key === packageJson.main || key === packageJson.module) {
      // Maps to root entry with browser condition
      mappings.push({
        entryPoint: '.',
        condition: 'browser', 
        path: normalizeRelativePath(value)
      });
    } else {
      // Creates new export entry
      mappings.push({
        entryPoint: normalizeRelativePath(key),
        condition: 'browser',
        path: normalizeRelativePath(value)
      });
    }
  }
  
  return mappings;
}
```

### 4. Integration with Export Generation
```typescript
function integrateB rowserMappings(
  exportsMap: ExportsMap, 
  browserMappings: BrowserMapping[]
): void {
  for (const mapping of browserMappings) {
    if (!exportsMap[mapping.entryPoint]) {
      exportsMap[mapping.entryPoint] = {};
    }
    
    if (typeof exportsMap[mapping.entryPoint] === 'object') {
      exportsMap[mapping.entryPoint][mapping.condition] = mapping.path;
    }
  }
}
```

## Technical Approach

### New Types Needed
```typescript
interface BrowserMapping {
  entryPoint: string;  // Export key (e.g., ".", "./lib/utils")
  condition: 'browser';
  path: string;        // File path
}

interface BrowserCondition {
  entryPoint: string;
  condition: 'browser';
  path: string;
}
```

### File Changes Required
1. `src/types.ts` - Add browser-related types
2. `src/fix.ts` - Add browser field parsing functions  
3. `src/fix.ts` - Integrate with `generateBaselineExports`

### Algorithm Flow
1. **Detect browser field presence and type**
2. **String format**: Add browser condition to root export
3. **Object format**: 
   - Iterate through key-value pairs
   - Check if key matches main/module (root export)
   - Otherwise create new export entry
   - Handle `false` values appropriately
4. **Integrate with existing exports map**

## Edge Cases to Consider

1. **False values**: `{"./lib/node-only.js": false}` - should block browser access
2. **Relative path normalization**: Ensure consistent "./" prefixes
3. **Conflicting paths**: Browser field overriding main/module paths
4. **Missing files**: Browser field references non-existent files
5. **Circular references**: Browser field referencing itself
6. **Mixed formats**: Edge case where browser field is partially malformed

## Testing Considerations

### Test Scenarios
1. **String browser field**: Simple replacement of main entry
2. **Object browser field with main override**: Root export gets browser condition
3. **Object browser field with new entries**: Additional exports created
4. **False values**: Blocked entries handled correctly
5. **Missing files**: Graceful handling of non-existent browser files
6. **Complex combinations**: Browser + main + module fields together

### Expected Outputs

**String browser field**:
```json
{
  ".": {
    "require": "./lib/index.js",
    "browser": "./lib/browser.js", 
    "default": "./lib/index.js"
  }
}
```

**Object browser field**:
```json
{
  ".": {
    "import": "./lib/index.esm.js",
    "require": "./lib/index.js", 
    "browser": "./lib/browser.js",
    "default": "./lib/index.js"
  },
  "./lib/utils": {
    "browser": "./lib/browser-utils.js",
    "default": "./lib/utils.js"
  }
}
```

## Success Criteria

- [ ] String browser fields correctly map to root export browser condition
- [ ] Object browser fields create appropriate export entries
- [ ] Main/module path matching works correctly
- [ ] False values are handled (no browser export created)
- [ ] Path normalization ensures consistent format
- [ ] Integration doesn't break existing export generation
- [ ] Comprehensive test coverage for all browser field formats

## Dependencies
- Work Item 02 (Baseline Export Generation) - integrates with this logic
- Work Item 07 (Enhanced File Discovery) - for validating browser file paths