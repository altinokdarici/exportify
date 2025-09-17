export interface PackageUsage {
  package: string;
  versionRequirement?: string;
  importPaths: string[];
}

export interface UsageData {
  [packageName: string]: PackageUsage;
}

export interface ExportsMap {
  [key: string]:
    | string
    | {
        types?: string;
        import?: string;
        require?: string;
        default?: string;
        browser?: string;
        source?: string;
      };
}
