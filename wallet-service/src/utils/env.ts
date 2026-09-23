import { NODE_ENV } from './variables';

export function getEnvExtension() {
  return NODE_ENV === 'production' ? '.ts' : '.js';
}
