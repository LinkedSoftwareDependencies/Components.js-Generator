import { ComponentsManagerBuilder } from 'componentsjs/lib/loading/ComponentsManagerBuilder';
import { PrefetchedDocumentLoader } from 'componentsjs/lib/rdf/PrefetchedDocumentLoader';
import type { LogLevel } from 'componentsjs/lib/util/LogLevel';
import { ContextParser } from 'jsonld-context-parser';
import { ClassFinder } from '../parse/ClassFinder';
import { ClassIndexer } from '../parse/ClassIndexer';
import { ClassLoader } from '../parse/ClassLoader';
import { ConstructorLoader } from '../parse/ConstructorLoader';
import { PackageMetadataLoader } from '../parse/PackageMetadataLoader';
import { ParameterResolver } from '../parse/ParameterResolver';
import { ExternalModulesLoader } from '../resolution/ExternalModulesLoader';
import type { ResolutionContext } from '../resolution/ResolutionContext';
import type { PathDestinationDefinition } from '../serialize/ComponentConstructor';
import { ComponentConstructor } from '../serialize/ComponentConstructor';
import { ComponentSerializer } from '../serialize/ComponentSerializer';
import { ContextConstructor } from '../serialize/ContextConstructor';

/**
 * Generates a components file by parsing a typescript file.
 */
export class Generator {
  private readonly resolutionContext: ResolutionContext;
  private readonly pathDestination: PathDestinationDefinition;
  private readonly fileExtension: string;
  private readonly ignoreClasses: Record<string, boolean>;
  private readonly typeScopedContexts: boolean;
  private readonly logLevel: LogLevel;
  private readonly prefix: string;

  public constructor(args: GeneratorArgs) {
    this.resolutionContext = args.resolutionContext;
    this.pathDestination = args.pathDestination;
    this.fileExtension = args.fileExtension;
    this.ignoreClasses = args.ignoreClasses;
    this.typeScopedContexts = args.typeScopedContexts;
    this.logLevel = args.logLevel;
    this.prefix = args.prefix;
  }

  public async generateComponents(): Promise<void> {
    const logger = ComponentsManagerBuilder.createLogger(this.logLevel);

    // Load package metadata
    const packageMetadata = await new PackageMetadataLoader({ resolutionContext: this.resolutionContext,
      prefix: this.prefix })
      .load(this.pathDestination.packageRootDirectory);

    const classLoader = new ClassLoader({ resolutionContext: this.resolutionContext, logger });
    const classFinder = new ClassFinder({ classLoader });
    const classIndexer = new ClassIndexer({ classLoader, classFinder, ignoreClasses: this.ignoreClasses, logger });

    // Find all relevant classes
    const packageExports = await classFinder.getPackageExports(packageMetadata.name, packageMetadata.typesPath);
    const classAndInterfaceIndex = await classIndexer.createIndex(packageExports);

    // Load constructor data
    const constructorsUnresolved = new ConstructorLoader().getConstructors(classAndInterfaceIndex);
    const constructors = await new ParameterResolver({ classLoader, ignoreClasses: this.ignoreClasses })
      .resolveAllConstructorParameters(constructorsUnresolved, classAndInterfaceIndex);

    // Load external components
    const externalModulesLoader = new ExternalModulesLoader({
      pathDestination: this.pathDestination,
      packageMetadata,
      logger,
    });
    const externalPackages = externalModulesLoader.findExternalPackages(classAndInterfaceIndex, constructors);
    const externalComponents = await externalModulesLoader.loadExternalComponents(require, externalPackages);

    // Create components
    const contextConstructor = new ContextConstructor({
      packageMetadata,
      typeScopedContexts: this.typeScopedContexts,
    });
    const componentConstructor = new ComponentConstructor({
      packageMetadata,
      contextConstructor,
      pathDestination: this.pathDestination,
      classAndInterfaceIndex,
      classConstructors: constructors,
      externalComponents,
      contextParser: new ContextParser({
        documentLoader: new PrefetchedDocumentLoader({
          contexts: externalComponents.moduleState.contexts,
          logger,
        }),
        skipValidation: true,
      }),
    });
    const components = await componentConstructor.constructComponents();
    const componentsIndex = await componentConstructor.constructComponentsIndex(components, this.fileExtension);

    // Serialize components
    const componentSerializer = new ComponentSerializer({
      resolutionContext: this.resolutionContext,
      pathDestination: this.pathDestination,
      fileExtension: this.fileExtension,
      indentation: '  ',
    });
    await componentSerializer.serializeComponents(components);
    await componentSerializer.serializeComponentsIndex(componentsIndex);

    // Serialize context
    const context = contextConstructor.constructContext(components);
    await componentSerializer.serializeContext(context);
  }
}

export interface GeneratorArgs {
  resolutionContext: ResolutionContext;
  pathDestination: PathDestinationDefinition;
  fileExtension: string;
  ignoreClasses: Record<string, boolean>;
  typeScopedContexts: boolean;
  logLevel: LogLevel;
  prefix: string;
}
