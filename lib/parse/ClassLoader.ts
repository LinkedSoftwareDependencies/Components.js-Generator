import * as Path from 'path';
import { AST_NODE_TYPES } from '@typescript-eslint/typescript-estree';
import { ClassDeclaration, Program } from '@typescript-eslint/typescript-estree/dist/ts-estree/ts-estree';
import { ResolutionContext } from '../resolution/ResolutionContext';

/**
 * Loads typescript classes from files.
 */
export class ClassLoader {
  private readonly resolutionContext: ResolutionContext;

  public constructor(args: ClassLoaderArgs) {
    this.resolutionContext = args.resolutionContext;
  }

  /**
   * Load a class, and get all class elements from it.
   * @param fileName A file path.
   */
  public async loadClassElements(fileName: string): Promise<ClassElements> {
    const ast = await this.resolutionContext.parseTypescriptFile(fileName);
    return this.getClassElements(fileName, ast);
  }

  /**
   * Get all class elements in a file.
   * @param fileName A file path.
   * @param ast The parsed file.
   */
  public getClassElements(fileName: string, ast: Program): ClassElements {
    const exportedClasses: { [exportedName: string]: ClassDeclaration } = {};
    const exportedImportedClasses: { [exportedName: string]: { localName: string; fileName: string } } = {};
    const exportedImportedAll: string[] = [];
    const exportedUnknowns: { [exportedName: string]: string } = {};
    const declaredClasses: { [localName: string]: ClassDeclaration } = {};
    const importedClasses: { [exportedName: string]: { localName: string; fileName: string } } = {};

    for (const statement of ast.body) {
      if (statement.type === AST_NODE_TYPES.ExportNamedDeclaration) {
        if (statement.declaration &&
          statement.declaration.type === AST_NODE_TYPES.ClassDeclaration) {
          // Form: `export class A{}`
          if (!statement.declaration.id) {
            throw new Error(`Export parsing failure: missing exported class name in ${fileName} on line ${statement.declaration.loc.start.line} column ${statement.declaration.loc.start.column}`);
          }
          exportedClasses[statement.declaration.id.name] = statement.declaration;
        } else if (statement.source &&
          statement.source.type === AST_NODE_TYPES.Literal &&
          typeof statement.source.value === 'string') {
          // Form: `export { A as B } from "b"`
          for (const specifier of statement.specifiers) {
            exportedImportedClasses[specifier.exported.name] = {
              localName: specifier.local.name,
              fileName: Path.join(Path.dirname(fileName), statement.source.value),
            };
          }
        } else {
          // Form: `export { A as B }`
          for (const specifier of statement.specifiers) {
            exportedUnknowns[specifier.exported.name] = specifier.local.name;
          }
        }
      } else if (statement.type === AST_NODE_TYPES.ExportAllDeclaration) {
        // Form: `export * from "b"`
        if (statement.source &&
          statement.source.type === AST_NODE_TYPES.Literal &&
          typeof statement.source.value === 'string') {
          exportedImportedAll.push(Path.join(Path.dirname(fileName), statement.source.value));
        }
      } else if (statement.type === AST_NODE_TYPES.ClassDeclaration && statement.id) {
        // Form: `declare class A {}`
        declaredClasses[statement.id.name] = statement;
      } else if (statement.type === AST_NODE_TYPES.ImportDeclaration &&
        statement.source.type === AST_NODE_TYPES.Literal &&
        typeof statement.source.value === 'string') {
        // Form: `import {A} from './lib/A'`
        for (const specifier of statement.specifiers) {
          if (specifier.type === AST_NODE_TYPES.ImportSpecifier) {
            importedClasses[specifier.local.name] = {
              localName: specifier.imported.name,
              fileName: Path.join(Path.dirname(fileName), statement.source.value),
            };
          }
        }
      }
    }

    return {
      exportedClasses,
      exportedImportedClasses,
      exportedImportedAll,
      exportedUnknowns,
      declaredClasses,
      importedClasses,
    };
  }
}

export interface ClassLoaderArgs {
  resolutionContext: ResolutionContext;
}

/**
 * Holder for all available classes in a file.
 */
export interface ClassElements {
  // Classes that have been declared in a file via `export class A`
  exportedClasses: {[exportedName: string]: ClassDeclaration};
  // Classes that have been exported via `export { A as B } from "b"`
  exportedImportedClasses: { [exportedName: string]: { localName: string; fileName: string } };
  // Exports via `export * from "b"`
  exportedImportedAll: string[];
  // Things that have been exported via `export {A as B}`, where the target is not known
  exportedUnknowns: { [exportedName: string]: string };
  // Classes that have been declared in a file via `declare class A`
  declaredClasses: {[localName: string]: ClassDeclaration};
  // Classes that are imported from elsewhere via `import {A} from ''`
  importedClasses: {[exportedName: string]: { localName: string; fileName: string }};
}