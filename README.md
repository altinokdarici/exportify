# Exportmapify

A CLI tool to identify deep imports from internal packages in monorepos and automatically generate package.json exports maps.

## Installation

```bash
npm install -g exportmapify
```

## Development

This project uses Yarn Berry managed by corepack:

```bash
corepack enable
yarn install
yarn build
```

## Usage

Exportmapify uses a two-step workflow:

### Step 1: Evaluate (Scan for imports)

Scan your repository to build a usage dictionary of package imports. The scanning process is **additive** - you can run it multiple times in different locations, and each scan will add new findings to the existing usage.json file without overwriting previous data:

```bash
# Scan current directory and create usage.json
exportmapify evaluate usage.json

# Scan specific directory (adds to existing usage.json)
exportmapify evaluate usage.json --cwd /path/to/repo

# Run multiple scans to build comprehensive usage data
exportmapify evaluate usage.json --cwd /path/to/frontend
exportmapify evaluate usage.json --cwd /path/to/backend
exportmapify evaluate usage.json --cwd /path/to/mobile
```

### Step 2: Fix (Generate exports)

Generate exports maps for packages based on the usage data. The fix command **only processes packages within the specified CWD tree** - if you have scanned usage from multiple repositories, only packages that exist in the target directory will have their exports updated:

```bash
# Generate exports for packages in current directory (updates package.json files)
exportmapify fix usage.json

# Preview what would be generated without making changes
exportmapify fix usage.json --dry-run

# Generate exports for packages in specific directory only
# (packages from other scanned repos won't be affected)
exportmapify fix usage.json --cwd /path/to/packages
```

### Single Repository Workflow

For a single monorepo, the workflow is straightforward. By default, both commands operate on all packages within the current working directory tree:

```bash
# 1. Scan the monorepo for all imports (scans all packages in CWD tree)
exportmapify evaluate usage.json --cwd /path/to/monorepo

# 2. Preview the exports that would be generated
exportmapify fix usage.json --dry-run --cwd /path/to/monorepo

# 3. Apply the exports to all package.json files (only packages in CWD tree)
exportmapify fix usage.json --cwd /path/to/monorepo
```

### Multi-Repository Workflow

For monorepos split across multiple repositories, use the `--main-repo` flag to specify which packages to track:

```bash
# 1. Scan the main repository (contains the packages you want to generate exports for)
exportmapify evaluate usage.json --cwd /path/to/main-repo

# 2. Scan consumer repositories (only tracks imports to main repo packages)
exportmapify evaluate usage.json --cwd /path/to/consumer-repo1 --main-repo /path/to/main-repo
exportmapify evaluate usage.json --cwd /path/to/consumer-repo2 --main-repo /path/to/main-repo

# 3. Generate exports for packages in the main repo
exportmapify fix usage.json --cwd /path/to/main-repo
```

**Example with real paths:**

```bash
# 1. Scan main-repo (main repo with @company/* packages)
exportmapify evaluate usage.json --cwd /Users/dev/projects/main-repo

# 2. Scan app-frontend (consumer repo that imports @company/* packages)
exportmapify evaluate usage.json --cwd /Users/dev/projects/app-frontend --main-repo /Users/dev/projects/main-repo

# 3. Scan mobile-app (another consumer repo)
exportmapify evaluate usage.json --cwd /Users/dev/projects/mobile-app --main-repo /Users/dev/projects/main-repo

# 4. Generate exports only for main-repo packages
exportmapify fix usage.json --cwd /Users/dev/projects/main-repo
```

## Usage Data Format

The `evaluate` command creates a usage dictionary tracking which packages are imported and how:

```json
{
  "@company/ui-components": {
    "package": "@company/ui-components",
    "versionRequirement": "*",
    "importPaths": [
      ".",
      "./lib/Button",
      "./lib/Modal",
      "./lib/TextField"
    ]
  },
  "@company/utils": {
    "package": "@company/utils",
    "versionRequirement": "^2.1.0",
    "importPaths": [
      ".",
      "./lib/formatDate",
      "./lib/validateEmail"
    ]
  }
}
```

## Generated Exports Format

The `fix` command generates proper exports maps with conditional exports:

```json
{
  "name": "@company/ui-components",
  "exports": {
    ".": {
      "types": "./lib/index.d.ts",
      "default": "./lib/index.js",
      "require": "./lib/index.js"
    },
    "./lib/Button": {
      "types": "./lib/lib/Button.d.ts",
      "default": "./lib/lib/Button.js"
    },
    "./lib/Modal": {
      "types": "./lib/lib/Modal.d.ts",
      "default": "./lib/lib/Modal.js"
    }
  }
}
```

## How Multi-Repository Analysis Works

### Main Repository Scanning
When you scan the main repository (without `--main-repo`), the tool:
- Discovers all packages in the repository automatically
- Tracks ALL imports (internal and external dependencies)
- Creates comprehensive usage data for the entire monorepo

### Consumer Repository Scanning
When you scan a consumer repository (with `--main-repo`), the tool:
- Discovers all packages in the main repository
- Only tracks imports that target packages from the main repository
- Ignores imports to external dependencies and other packages
- Merges findings with existing usage data

### Export Generation
The `fix` command:
- Only processes packages that exist in the target directory
- Only generates exports for packages with deep imports (beyond root import)
- Skips packages that only have root imports (e.g., just `"."`)

## Features

- **Two-step workflow**: Separate analysis and generation phases for flexibility
- **Cross-repository analysis**: Scan multiple repos while filtering for specific package imports
- **Smart exports generation**: Automatically infers exports from package.json fields (main, module, types, browser)
- **File detection**: Finds actual files in lib/, dist/, src/ directories with proper TypeScript → JavaScript mapping
- **Version tracking**: Captures version requirements from package.json dependencies
- **High performance**: Optimized parallel processing for large monorepos (100k+ files)
- **Comprehensive file support**: TypeScript (.ts, .tsx, .mts, .cts), JavaScript (.js, .jsx, .cjs, .mjs)
- **Import detection**: ES6 imports, CommonJS requires, and dynamic imports
- **Conditional exports**: Generates proper types, import, require, default, and browser fields
- **Selective tracking**: Only tracks packages you care about when scanning consumer repositories
- **Data merging**: Multiple scans contribute to the same usage file for comprehensive analysis

## Key Behaviors

### Additive Scanning
The `evaluate` command is **additive** - running it multiple times will:
- Merge new import findings with existing usage data
- Preserve previously discovered imports
- Update version requirements if new ones are found
- Allow building comprehensive usage data across multiple scans

### CWD Tree Scoping
Commands operate within the specified working directory tree:
- **`evaluate`**: Scans all source files within the CWD tree (ignoring node_modules, dist, etc.)
- **`fix`**: Only updates package.json files for packages that exist within the CWD tree
- This ensures that scanning usage in one repository doesn't accidentally modify packages in another repository