import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { ConvexReactClient } from "convex/react";
import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { authClient } from "@/lib/auth-client";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "./index.css";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

// 阶段 1 设计确认用的示例页（样例数据，不连后端、不需要登录），只在本地开发时可用。
const preview = new URLSearchParams(window.location.search).get("preview");
const TodayPreview = lazy(() => import("@/features/design-preview/TodayPreview"));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {import.meta.env.DEV && preview === "today" ? (
      <Suspense fallback={null}>
        <TodayPreview />
      </Suspense>
    ) : (
      <ConvexBetterAuthProvider client={convex} authClient={authClient}>
        <App />
      </ConvexBetterAuthProvider>
    )}
  </StrictMode>,
);
