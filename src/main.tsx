import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { I18nProvider } from "@lingui/react";
import { ConvexReactClient } from "convex/react";
import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { authClient } from "@/lib/auth-client";
import { activateLocale, detectLocale, i18n } from "@/lib/i18n";
import "./fonts.css";
import "./index.css";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

// 阶段 1 设计确认用的示例页（样例数据，不连后端、不需要登录），只在本地开发时可用。
const preview = new URLSearchParams(window.location.search).get("preview");
const PREVIEWS = {
  today: lazy(() => import("@/features/design-preview/TodayPreview")),
  members: lazy(() => import("@/features/design-preview/MembersPreview")),
  signin: lazy(() => import("@/features/auth/SignIn").then((m) => ({ default: m.SignIn }))),
};
const Preview = preview && preview in PREVIEWS ? PREVIEWS[preview as keyof typeof PREVIEWS] : null;

// 先加载界面语言再渲染，避免先闪一下另一种语言
await activateLocale(detectLocale());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nProvider i18n={i18n}>
    {import.meta.env.DEV && Preview ? (
      <Suspense fallback={null}>
        <Preview />
      </Suspense>
    ) : (
      <ConvexBetterAuthProvider client={convex} authClient={authClient}>
        <App />
      </ConvexBetterAuthProvider>
    )}
    </I18nProvider>
  </StrictMode>,
);
