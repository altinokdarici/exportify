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

Scan your repository to build a usage dictionary of package imports:

```bash
# Scan current directory and create usage.json
exportmapify evaluate usage.json

# Scan specific directory
exportmapify evaluate usage.json --cwd /path/to/repo
```

### Step 2: Fix (Generate exports)

Generate exports maps for packages based on the usage data:

```bash
# Generate exports for packages (updates package.json files)
exportmapify fix usage.json

# Preview what would be generated without making changes
exportmapify fix usage.json --dry-run

# Generate exports for packages in specific directory
exportmapify fix usage.json --cwd /path/to/packages
```

### Single Repository Workflow

For a single monorepo, the workflow is straightforward:

```bash
# 1. Scan the monorepo for all imports
exportmapify evaluate usage.json --cwd /path/to/monorepo

# 2. Preview the exports that would be generated
exportmapify fix usage.json --dry-run --cwd /path/to/monorepo

# 3. Apply the exports to all package.json files
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
# 1. Scan midgard (main repo with @1js/* packages)
exportmapify evaluate usage.json --cwd /Users/me/Repo/1js/midgard

# 2. Scan ooui (consumer repo that imports @1js/* packages)
exportmapify evaluate usage.json --cwd /Users/me/Repo/1js/ooui --main-repo /Users/me/Repo/1js/midgard

# 3. Scan office-bohemia (another consumer repo)
exportmapify evaluate usage.json --cwd /Users/me/Repo/office-bohemia --main-repo /Users/me/Repo/1js/midgard

# 4. Generate exports only for midgard packages
exportmapify fix usage.json --cwd /Users/me/Repo/1js/midgard
```

## Usage Data Format

The `evaluate` command creates a usage dictionary tracking which packages are imported and how:

```json
{
  "@1js/localization": {
    "package": "@1js/localization",
    "versionRequirement": "*",
    "importPaths": [
      ".",
      "./lib/declareString",
      "./lib/defaultStringProvider",
      "./lib/stringMap"
    ]
  },
  "@1js/search-components": {
    "package": "@1js/search-components",
    "versionRequirement": "^2.1.0",
    "importPaths": [
      ".",
      "./lib/SearchBox",
      "./lib/ResultsList"
    ]
  }
}
```

## Generated Exports Format

The `fix` command generates proper exports maps with conditional exports:

```json
{
  "name": "@1js/localization",
  "exports": {
    ".": {
      "types": "./lib/index.d.ts",
      "default": "./lib/index.js",
      "require": "./lib/index.js"
    },
    "./lib/declareString": {
      "types": "./lib/lib/declareString.d.ts",
      "default": "./lib/lib/declareString.js"
    },
    "./lib/defaultStringProvider": {
      "types": "./lib/lib/defaultStringProvider.d.ts",
      "default": "./lib/lib/defaultStringProvider.js"
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