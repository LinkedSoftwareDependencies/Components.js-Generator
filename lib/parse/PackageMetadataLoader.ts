import * as Path from 'path';
import semverMajor = require('semver/functions/major');
import type { ResolutionContext } from '../resolution/ResolutionContext';

/**
 * Load metadata from packages.
 */
export class PackageMetadataLoader {
  private readonly resolutionContext: ResolutionContext;
  private readonly prefix?: string;

  public constructor(args: PackageMetadataLoaderArgs) {
    this.resolutionContext = args.resolutionContext;
    this.prefix = args.prefix;
  }

  /**
   * Load the metadata from the given package.
   * @param packageRootDirectory The path to a package that should contain a package.json.
   */
  public async load(packageRootDirectory: string): Promise<PackageMetadata> {
    // Read package.json
    const packageJsonPath = Path.join(packageRootDirectory, 'package.json');
    const packageJsonRaw = await this.resolutionContext.getFileContent(packageJsonPath);
    let packageJson: any;
    try {
      packageJson = JSON.parse(packageJsonRaw);
    } catch (error: unknown) {
      throw new Error(`Invalid package: Syntax error in ${packageJsonPath}: ${(<Error> error).message}`);
    }

    // Preprocess to expand `"lsd:module": true`
    if (packageJson['lsd:module'] === true) {
      packageJson['lsd:module'] = `https://linkedsoftwaredependencies.org/bundles/npm/${packageJson.name}`;
      const basePath = packageJson['lsd:basePath'] || '';
      packageJson['lsd:components'] = `${basePath}components/components.jsonld`;
      const baseIri = `${packageJson['lsd:module']}/^${semverMajor(packageJson.version)}.0.0/`;
      packageJson['lsd:contexts'] = {
        [`${baseIri}components/context.jsonld`]: `${basePath}components/context.jsonld`,
      };
      packageJson['lsd:importPaths'] = {
        [`${baseIri}components/`]: `${basePath}components/`,
        [`${baseIri}config/`]: `${basePath}config/`,
      };
    }

    // Extract required fields from package.json
    const name = packageJson.name;
    const version = packageJson.version;
    if (!('lsd:module' in packageJson)) {
      throw new Error(`Invalid package: Missing 'lsd:module' IRI in ${packageJsonPath}`);
    }
    const moduleIri = packageJson['lsd:module'];
    if (!('lsd:components' in packageJson)) {
      throw new Error(`Invalid package: Missing 'lsd:components' in ${packageJsonPath}`);
    }
    const componentsPath = Path.join(packageRootDirectory, packageJson['lsd:components']);
    if (!('lsd:contexts' in packageJson)) {
      throw new Error(`Invalid package: Missing 'lsd:contexts' in ${packageJsonPath}`);
    }
    const contexts = packageJson['lsd:contexts'];
    if (!('lsd:importPaths' in packageJson)) {
      throw new Error(`Invalid package: Missing 'lsd:importPaths' in ${packageJsonPath}`);
    }
    const importPaths = packageJson['lsd:importPaths'];
    if (!('types' in packageJson) && !('typings' in packageJson)) {
      throw new Error(`Invalid package: Missing 'types' or 'typings' in ${packageJsonPath}`);
    }
    let typesPath = Path.join(packageRootDirectory, packageJson.types || packageJson.typings);
    if (typesPath.endsWith('.d.ts')) {
      typesPath = typesPath.slice(0, -5);
    }

    // Construct metadata hash
    return {
      name,
      version,
      moduleIri,
      componentsPath,
      contexts,
      importPaths,
      typesPath,
      prefix: this.prefix,
    };
  }
}

export interface PackageMetadataLoaderArgs {
  resolutionContext: ResolutionContext;
  prefix?: string;
}

export interface PackageMetadata {
  name: string;
  version: string;
  moduleIri: string;
  componentsPath: string;
  contexts: Record<string, string>;
  importPaths: Record<string, string>;
  typesPath: string;
  prefix?: string;
}
