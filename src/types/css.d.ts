declare module '*.css?inline' {
  const content: string;
  export default content;
}

// Vite HMR types
interface ImportMetaHot {
  accept(): void;
  accept(cb: () => void): void;
  accept(dep: string, cb: () => void): void;
  accept(deps: string[], cb: () => void): void;
  dispose(cb: () => void): void;
  decline(): void;
  invalidate(): void;
}

interface ImportMeta {
  hot?: ImportMetaHot;
} 