import path from 'path';
import { randomUUID } from 'node:crypto';
import logger from './logger';
import { EnvironmentError, Unexpected } from './errors';

import type { Utility } from '../declaration/utility.types';

import { getEnvExtension } from './env';

export function envVariable(variable: string, convertTo?: string): string | number | boolean {
  const envVar = process.env[variable];
  
  if (envVar != null && envVar.trim() !== '') {
    switch (convertTo?.toLowerCase()) {
    case 'int':
      return parseInt(envVar, 10);
    case 'string':
      return envVar.toString();
    case 'boolean':
      return !!(envVar === 'true');
    default:
      return envVar;
    }
  }
  throw new EnvironmentError(`Environment variable ${variable} is not set.`);
}

export function getAsArray<T>(data: null | undefined | [] | T | T[]): Utility[] | [] {
  if (data == null) {
    return [];
  }
  if (Array.isArray(data)) {
    return data;
  }
  return [data];
}

export function getModuleName(dirname: string): string {
  return path.basename(dirname).replace(/-/g, '_');
}

export function relateModel(tag: string): Promise<Utility> {
  return new Promise((resolve, reject) => {
    import(path.join('../', 'modules', tag, `model${getEnvExtension()}`)).then((Model) => { resolve(Model); }).catch((err) => {
      logger.error(err);
      reject(new Unexpected());
    });
  });
}

export const generateUUID = (): string => randomUUID();

export const initVariable = <T>(variable: Utility, type?: string): Utility => {
  let result = variable;
  if (type) {
    switch (type) {
    case 'string':
      result = String(variable);
      break;
    case 'int':
      result = Number(variable);
      break;
    default: result = variable as T;
      break;
    }
  } else return result as T;
};

export function getInitiatorsStackRuntime(): string[] {
  const { stack } = new Error();
  if (stack) {
    const stackLines = stack.split('\n');
    const initiators = [];
    for (let index = 1; index < stackLines.length; index += 1) {
      const match = stackLines[index].match(/\((.*):\d+:\d+\)/);
      if (match?.[1]) {
        const arr = match[1].split('/');
        initiators.push(arr.slice(6).join('/'));
      }
    }
    return initiators;
  }
  return [];
}
export const convertModuleToRoute = (module: string): string => module
  .replace(/([a-z])([A-Z])/g, '$1-$2')
  .replace(/_/g, '-')
  .toLowerCase();

export const convertTypeToModule = (type: string): string => type
  .replace(/([a-z])([A-Z])/g, '$1_$2')
  .replace(/^([A-Z])/, (match) => match);
