// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getAsArray<T>(data: null | undefined | [] | T | T[]): any[] | [] {
  if (data == null) {
    return [];
  }
  if (Array.isArray(data)) {
    return data;
  }
  return [data];
}