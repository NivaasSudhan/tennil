export function invariant(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`Invariant violation: ${msg}`);
}
