import { useSyncExternalStore } from "react";

/** 极简路由：只用 location.hash（#/members 等）。页面多起来后再换正式路由库。 */
export function useHashRoute(): string {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener("hashchange", cb);
      return () => window.removeEventListener("hashchange", cb);
    },
    () => window.location.hash.replace(/^#/, "") || "/",
  );
}

export function navigate(path: string) {
  window.location.hash = path;
}
