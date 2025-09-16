# Work Item 07: Enhanced File Discovery

## Overview
Improve file detection and TypeScript declaration mapping to provide more robust file existence validation and better handling of different file types and build outputs.

## Current Behavior
Current implementation has basic file detection in `generateExportEntry`:

```typescript
async function generateExportEntry(importPath: string, packagePath: string) {
  // Basic file existence check with limited extension handling
}
```

## Target Behavior
Enhanced file discovery that:
- Handles multiple file extensions and patterns
- Maps TypeScript declarations correctly
- Validates file existence efficiently
- Supports different build output structures
- Provides utilities for other work items

## Implementation Requirements

### 1. File Existence Utilities
```typescript
interface FileExistsResult {
  exists: boolean;
  path?: string;
  type?: 'file' | 'directory';
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(filePath);
    return stats.isFile();
  } catch {
    return false;
  }
}

async function directoryExists(dirPath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(dirPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

async function findExistingFile(
  basePath: string, 
  extensions: string[]
): Promise<string | null> {
  for (const ext of extensions) {
    const filePath = basePath + ext;
    if (await fileExists(filePath)) {
      return filePath;
    }
  }
  return null;
}
```

### 2. TypeScript Declaration Mapping
```typescript
interface DeclarationMapping {
  jsFile: string;
  dtsFile: string;
  exists: boolean;
}

async function findDeclarationFile(
  jsFilePath: string, 
  packageDir: string
): Promise<string | null> {
  
  // Convert .js/.mjs/.cjs to .d.ts
  const withoutExt = jsFilePath.replace(/\.(m?js|cjs)$/, '');
  const dtsPath = withoutExt + '.d.ts';
  
  if (await fileExists(path.join(packageDir, dtsPath))) {
    return dtsPath;
  }
  
  // Try .d.mts for .mjs files
  if (jsFilePath.endsWith('.mjs')) {
    const dMtsPath = withoutExt + '.d.mts';
    if (await fileExists(path.join(packageDir, dMtsPath))) {
      return dMtsPath;
    }
  }
  
  // Try .d.cts for .cjs files  
  if (jsFilePath.endsWith('.cjs')) {
    const dCtsPath = withoutExt + '.d.cts';
    if (await fileExists(path.join(packageDir, dCtsPath))) {
      return dCtsPath;
    }
  }
  
  return null;
}
```

### 3. Multi-Extension File Discovery
```typescript
interface FileDiscoveryOptions {
  extensions: string[];
  includeIndex: boolean;
  checkDeclarations: boolean;
}

interface DiscoveredFile {
  main: string;
  declarations?: string;
  type: 'file' | 'index' | 'inferred';
}

async function discoverFile(
  targetPath: string,
  packageDir: string, 
  options: FileDiscoveryOptions
): Promise<DiscoveredFile | null> {
  
  const fullTargetPath = path.join(packageDir, targetPath);
  
  // 1. Try exact path
  if (await fileExists(fullTargetPath)) {
    const declarations = options.checkDeclarations 
      ? await findDeclarationFile(targetPath, packageDir)
      : undefined;
    
    return {
      main: targetPath,
      declarations,
      type: 'file'
    };
  }
  
  // 2. Try with extensions
  const withoutExt = targetPath.replace(/\.[^.]*$/, '');
  for (const ext of options.extensions) {
    const pathWithExt = withoutExt + ext;
    const fullPath = path.join(packageDir, pathWithExt);
    
    if (await fileExists(fullPath)) {
      const declarations = options.checkDeclarations 
        ? await findDeclarationFile(pathWithExt, packageDir)
        : undefined;
      
      return {
        main: pathWithExt,
        declarations,
        type: 'file'
      };
    }
  }
  
  // 3. Try index files if enabled
  if (options.includeIndex) {
    const indexResult = await discoverIndexFile(targetPath, packageDir, options);
    if (indexResult) {
      return indexResult;
    }
  }
  
  return null;
}

async function discoverIndexFile(
  dirPath: string,
  packageDir: string,
  options: FileDiscoveryOptions  
): Promise<DiscoveredFile | null> {
  
  const indexBasePath = path.join(dirPath, 'index');
  
  for (const ext of options.extensions) {
    const indexPath = indexBasePath + ext;
    const fullPath = path.join(packageDir, indexPath);
    
    if (await fileExists(fullPath)) {
      const declarations = options.checkDeclarations
        ? await findDeclarationFile(indexPath, packageDir)
        : undefined;
      
      return {
        main: indexPath,
        declarations,
        type: 'index'
      };
    }
  }
  
  return null;
}
```

### 4. Build Output Structure Detection
```typescript
interface BuildStructure {
  hasLib: boolean;
  hasDist: boolean;
  hasBuild: boolean;
  hasTypes: boolean;
  preferredOutput: string;
}

async function analyzeBuildStructure(packageDir: string): Promise<BuildStructure> {
  const structure: BuildStructure = {
    hasLib: await directoryExists(path.join(packageDir, 'lib')),
    hasDist: await directoryExists(path.join(packageDir, 'dist')),
    hasBuild: await directoryExists(path.join(packageDir, 'build')),
    hasTypes: false,
    preferredOutput: 'lib'
  };
  
  // Check for types directory
  structure.hasTypes = await directoryExists(path.join(packageDir, 'types')) ||
                       await directoryExists(path.join(packageDir, 'typings'));
  
  // Determine preferred output directory
  if (structure.hasDist) structure.preferredOutput = 'dist';
  else if (structure.hasBuild) structure.preferredOutput = 'build';
  else if (structure.hasLib) structure.preferredOutput = 'lib';
  
  return structure;
}
```

### 5. Batch File Operations
```typescript
interface BatchFileCheck {
  path: string;
  exists: boolean;
  type?: 'file' | 'directory';
}

async function checkFilesBatch(
  filePaths: string[], 
  baseDir: string
): Promise<BatchFileCheck[]> {
  
  const checks = filePaths.map(async (filePath) => {
    const fullPath = path.join(baseDir, filePath);
    try {
      const stats = await fs.stat(fullPath);
      return {
        path: filePath,
        exists: true,
        type: stats.isFile() ? 'file' as const : 'directory' as const
      };
    } catch {
      return {
        path: filePath,
        exists: false
      };
    }
  });
  
  return Promise.all(checks);
}
```

## Technical Approach

### File Changes Required
1. `src/fix.ts` - Add file discovery utilities
2. `src/fix.ts` - Replace basic file checks with enhanced discovery
3. `src/fix.ts` - Update `generateExportEntry` to use new utilities
4. `src/evaluate.ts` - May benefit from file utilities for package discovery

### Integration Points
- **Work Item 04 (Source File Inference)**: Use for source file discovery
- **Work Item 06 (Source Condition Support)**: Use for source mapping
- **Work Item 05 (CJS/ESM Delta Logic)**: Use for validating expanded paths
- **Work Item 02 (Baseline Export Generation)**: Use for validating baseline files

### Algorithm Flow
1. **Enhanced file existence checking** with multiple extension support
2. **TypeScript declaration mapping** for .d.ts file discovery
3. **Index file resolution** for directory imports
4. **Build structure analysis** to understand package layout
5. **Batch operations** for efficient file system access

## Edge Cases to Consider

1. **Symlinks**: Handle symbolic links in file discovery
2. **Case sensitivity**: Cross-platform file name handling
3. **Permission errors**: Graceful handling of inaccessible files
4. **Large directories**: Efficient handling of packages with many files
5. **Network filesystems**: Handle slower file system operations
6. **Build artifacts**: Distinguish between source and built files

## Testing Considerations

### Test Scenarios
1. **Standard file discovery**: .js, .mjs, .cjs files with .d.ts
2. **Index file resolution**: Directory imports to index files
3. **Missing files**: Graceful handling of non-existent files
4. **Multiple extensions**: Trying different file extensions
5. **Declaration mapping**: .js → .d.ts, .mjs → .d.mts, .cjs → .d.cts
6. **Build structure detection**: Different output directory layouts

### Performance Considerations
- **Parallel file checks**: Use Promise.all for concurrent operations
- **Caching**: Cache file existence results for repeated checks
- **Early termination**: Stop searching once file is found
- **Batch operations**: Group file system operations efficiently

## Success Criteria

- [ ] Robust file existence checking with multiple extensions
- [ ] Correct TypeScript declaration file mapping
- [ ] Index file resolution for directory imports
- [ ] Build structure analysis and detection
- [ ] Performance optimizations for large packages
- [ ] Integration with other work items' file needs
- [ ] Comprehensive error handling for file system operations

## Dependencies
- **Foundational**: Other work items depend on these utilities
- **No blocking dependencies**: Can be implemented independently
- **Integration points**: Will be used by Items 02, 04, 05, 06