export const convertModuleToRoute = (module: string): string => module
  .replace(/([a-z])([A-Z])/g, '$1-$2')
  .replace(/_/g, '-')
  .toLowerCase();
