import { i18n, type Messages } from "@lingui/core";

/**
 * 界面语言：中文（源语言）和英文。
 * 第一次打开跟随浏览器语言；用户切换后记在本机（localStorage）和账号上（convex/prefs.ts），
 * 登录后以账号上的设置为准，手机和电脑一致。只翻译界面，不翻译用户写的内容。
 */
export type Locale = "zh-CN" | "en";
export const LOCALES: readonly Locale[] = ["zh-CN", "en"];
const STORAGE_KEY = "locale";

export function isLocale(value: unknown): value is Locale {
  return value === "zh-CN" || value === "en";
}

export function detectLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isLocale(stored)) return stored;
  } catch {
    // 隐私模式等情况下 localStorage 不可用，退回浏览器语言
  }
  const langs = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const lang of langs) {
    const l = lang.toLowerCase();
    if (l.startsWith("zh")) return "zh-CN";
    if (l.startsWith("en")) return "en";
  }
  return "en";
}

const loaders: Record<Locale, () => Promise<{ messages: Messages }>> = {
  "zh-CN": () => import("../locales/zh-CN/messages.po"),
  en: () => import("../locales/en/messages.po"),
};

export async function activateLocale(locale: Locale): Promise<void> {
  if (i18n.locale === locale) return;
  const { messages } = await loaders[locale]();
  i18n.loadAndActivate({ locale, messages });
  document.documentElement.lang = locale;
  document.title = locale === "en" ? "Life OS" : "人生操作系统";
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // 同上，记不住也不影响使用
  }
}

export { i18n };
