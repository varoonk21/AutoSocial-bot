import { Suspense } from "react";

export function ModuleLoader({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      {children}
    </Suspense>
  );
}
