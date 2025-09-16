# Work Item 01: Version Tracking Enhancement

## Overview
Add `versionInstalled` field to package usage tracking alongside the existing `versionRequirement` field to match the specification requirements.

## Current Behavior
The current implementation only tracks `versionRequirement` from package.json dependencies:

```typescript
export interface PackageUsage {
  package: string;
  versionRequirement?: string;
  importPaths: string[];
}
```

## Target Behavior
According to the spec, we need to track both version requirement and installed version:

```typescript
export interface PackageUsage {
  package: string;
  versionRequirement?: string;
  versionInstalled?: string;
  importPaths: string[];
}
```

## Implementation Requirements

### 1. Update Type Definitions
- Add `versionInstalled?: string` to `PackageUsage` interface in `src/types.ts`

### 2. Version Detection Logic
Implement version detection in `src/evaluate.ts`:

- **Primary**: Read from `node_modules/[package]/package.json` to get actual installed version
- **Fallback**: Parse `package-lock.json` or `yarn.lock` for version information
- **Error handling**: Gracefully handle missing version information

### 3. Update Usage Data Collection
Modify the `updateUsageData` function in `src/evaluate.ts` to:
- Detect installed version for each discovered package
- Store both version requirement and installed version
- Handle cases where package is not installed (dev-only scenarios)

## Technical Approach

### File Changes Required
1. `src/types.ts` - Update interface
2. `src/evaluate.ts` - Add version detection logic
3. `src/evaluate.ts` - Update `updateUsageData` function

### Version Detection Algorithm
```typescript
async function getInstalledVersion(packageName: string, cwd: string): Promise<string | undefined> {
  // 1. Try node_modules/[package]/package.json
  // 2. Fallback to package-lock.json parsing
  // 3. Fallback to yarn.lock parsing
  // 4. Return undefined if not found
}
```

## Edge Cases to Consider

1. **Monorepo workspaces**: Package might be satisfied by workspace dependency
2. **Missing packages**: Package in usage but not installed (should not fail)
3. **Version conflicts**: Different versions in different package-lock files
4. **Hoisted packages**: Package installed at root level in monorepo

## Testing Considerations

1. Test with packages that exist in node_modules
2. Test with packages that don't exist (should not crash)
3. Test in monorepo scenarios with workspace dependencies
4. Test version parsing from both npm and yarn lock files

## Success Criteria

- [ ] `PackageUsage` interface includes `versionInstalled` field
- [ ] Version detection works for installed packages
- [ ] Graceful handling when packages are not installed
- [ ] No breaking changes to existing functionality
- [ ] Updated usage.json output includes both version fields

## Dependencies
None - this is a foundational change that other work items may build upon.