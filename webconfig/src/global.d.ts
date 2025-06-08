// Global type helpers for compatibility with some library type definitions
// Define ReadonlySetLike which some versions of mobx reference.
// This is a minimal compatible alias to avoid TypeScript errors.
export { };

declare global {
  // Minimal alias that matches mobx' expectations.
  type ReadonlySetLike<T> = ReadonlySet<T> | Set<T>;
}
