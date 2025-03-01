import type { PackageMetadata, ExportCondition, ExportType } from './types'
import { resolve } from 'path'

export function getTypings(pkg: PackageMetadata) {
  return pkg.types || pkg.typings
}

function getDistPath(distPath: string, cwd: string) {
  return resolve(cwd, distPath)
}

function findExport(field: any): string | undefined {
  if (!field) return
  if (typeof field === 'string') return field
  const value = field['.'] || field['import'] || field['module'] || field['default']
  return findExport(value)
}

function parseExport(exportsCondition: ExportCondition) {
  const paths: Record<Exclude<ExportType, 'default'>, string | undefined> = {}

  if (typeof exportsCondition === 'string') {
    paths.export = exportsCondition
  } else {
    paths.main = paths.main || exportsCondition['require'] || exportsCondition['node'] || exportsCondition['default']
    paths.module = paths.module || exportsCondition['module']
    paths.export = findExport(exportsCondition)
  }
  return paths
}


/**
 * Get package exports paths
 *
 * Example:
 *
 * ```json
 * {
 *  "exports": {
 *    ".": {
 *      "require": "./dist/index.cjs",
 *      "module": "./dist/index.esm.js",
 *      "default": "./dist/index.esm.js"
 *    },
 *    "./foo": {
 *      "require": "./dist/foo.cjs",
 *      "module": "./dist/foo.esm.js",
 *      "default": "./dist/foo.esm.js"
 *   }
 * }
 *
 * ```
 *
 * will be parsed to:
 *
 * ```js
 * {
 *   '.': {
 *     main: './dist/index.cjs',
 *     module: './dist/index.esm.js',
 *     export: './dist/index.esm.js'
 *   },
 *   './foo': {
 *     main: './dist/foo.cjs',
 *     module: './dist/foo.esm.js',
 *     export: './dist/foo.esm.js'
 *   }
 *
 *
 * pkg.main and pkg.module will be added to ['.'] if exists
 */

export function getExportPaths(pkg: PackageMetadata) {
  const pathsMap: Record<string, Record<string, string | undefined>> = {}
  const mainExport: Record<Exclude<ExportType, 'default'>, string> = {}
  if (pkg.main) {
    mainExport.main = pkg.main
  }
  if (pkg.module) {
    mainExport.module = pkg.module
  }
  pathsMap['.'] = mainExport

  const { exports: exportsConditions } = pkg
  if (exportsConditions) {
    if (typeof exportsConditions === 'string') {
      mainExport.export = exportsConditions
    } else {
      const exportKeys = Object.keys(exportsConditions)
      if (exportKeys.some((key) => key.startsWith('.'))) {
        exportKeys.forEach((subExport) => {
          pathsMap[subExport] = parseExport(exportsConditions[subExport])
        })
      } else {
        Object.assign(mainExport, parseExport(exportsConditions as ExportCondition))
      }
    }
  }
  pathsMap['.'] = mainExport

  return pathsMap
}

export function getExportDist(pkg: PackageMetadata, cwd: string) {
  const paths = getExportPaths(pkg)['.']
  const dist: { format: 'cjs' | 'esm'; file: string }[] = []
  if (paths.main) {
    dist.push({ format: 'cjs', file: getDistPath(paths.main, cwd) })
  }
  if (paths.module) {
    dist.push({ format: 'esm', file: getDistPath(paths.module, cwd) })
  }
  if (paths.export) {
    dist.push({ format: 'esm', file: getDistPath(paths.export, cwd) })
  }

  // default fallback to output `dist/index.js` in default esm format
  if (dist.length === 0) {
    dist.push({ format: 'esm', file: getDistPath('dist/index.js', cwd) })
  }
  return dist
}

export function getExportConditionDist(pkg: PackageMetadata, exportCondition: ExportCondition, cwd: string) {
  const dist: { format: 'cjs' | 'esm'; file: string }[] = []
  // "exports": "..."
  if (typeof exportCondition === 'string') {
    dist.push({ format: pkg.type === 'module' ? 'esm' : 'cjs', file: getDistPath(exportCondition, cwd) })
  } else {
    // "./<subexport>": { }
    const subExports = exportCondition
    // Ignore json exports, like "./package.json"
    if (typeof subExports === 'string') {
      dist.push({ format: 'esm', file: getDistPath(subExports, cwd) })
    } else {
      if (subExports.require) {
        dist.push({ format: 'cjs', file: getDistPath(subExports.require, cwd) })
      }
      if (subExports.import) {
        dist.push({ format: 'esm', file: getDistPath(subExports.import, cwd) })
      }
    }
  }
  return dist
}
