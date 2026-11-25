import { useLingui } from "@lingui/react";
import { activateLocale, isLocale, type Locale } from "./i18n";
import { cn } from "./utils";

/**
 * 中文 / English 切换。显示的是「另一种语言」的名字，各自用本语言书写，不认识当前语言的人也能找到。
 * 登录后由调用方传 onSwitch，把选择记到账号上（convex/prefs.ts）。
 */
export function LocaleSwitch({
  onSwitch,
  className,
}: {
  onSwitch?: (locale: Locale) => void;
  className?: string;
}) {
  const { i18n } = useLingui();
  const current: Locale = isLocale(i18n.locale) ? i18n.locale : "zh-CN";
  const next: Locale = current === "en" ? "zh-CN" : "en";

  return (
    <button
      type="button"
      lang={next}
      onClick={() => {
        void activateLocale(next);
        onSwitch?.(next);
      }}
      className={cn("text-sm text-ink-3 transition-colors duration-150 hover:text-ink", className)}
    >
      {next === "en" ? "English" : "中文"}
    </button>
  );
}
