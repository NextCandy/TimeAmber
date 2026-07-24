export function normalizeTextLineTerminators(value: string): string {
  return value.replace(/\u2028|\u2029/g, "\n");
}
