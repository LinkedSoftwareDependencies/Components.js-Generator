#!/usr/bin/env node
import * as fs from 'fs';
import * as Path from 'path';
import * as minimist from 'minimist';
import { Generator } from '../lib/generate/Generator';
import { ResolutionContext } from '../lib/resolution/ResolutionContext';

function showHelp(): void {
  process.stderr.write(`Generates components files for TypeScript files in a package
Usage:
  componentsjs-generator
  Options:
       -p path/to/package      The directory of the package to look in, defaults to working directory
       -s lib                  Relative path to directory containing source files, defaults to 'lib'
       -c components           Relative path to directory that will contain components files, defaults to 'components'
       -e jsonld               Extension for components files (without .), defaults to 'jsonld'
       -i ignore-classes.json  Relative path to an optional file with class names to ignore
       -l info                 The logger level
       -r prefix               Prefix of the package, optional
       --help                  Show information about this command

  Experimental options:
       --typeScopedContexts    If a type-scoped context for each component is to be generated with parameter name aliases
`);
  process.exit(1);
}

const args = minimist(process.argv.slice(2));
if (args.help) {
  showHelp();
} else {
  const packageRootDirectory = Path.posix.join(process.cwd(), args.p || '');
  const generator = new Generator({
    resolutionContext: new ResolutionContext(),
    pathDestination: {
      packageRootDirectory,
      originalPath: Path.posix.join(packageRootDirectory, args.s || 'lib'),
      replacementPath: Path.posix.join(packageRootDirectory, args.c || 'components'),
    },
    fileExtension: args.e || 'jsonld',
    typeScopedContexts: args.typeScopedContexts,
    logLevel: args.l || 'info',
    prefix: args.r,
    ignoreClasses: args.i ?
      // eslint-disable-next-line no-sync
      JSON.parse(fs.readFileSync(args.i, 'utf8')).reduce((acc: Record<string, boolean>, entry: string) => {
        acc[entry] = true;
        return acc;
      }, {}) :
      [],
  });
  generator
    .generateComponents()
    .catch((error: Error) => {
      process.stderr.write(`${error.message}\n`);
      process.exit(1);
    });
}

