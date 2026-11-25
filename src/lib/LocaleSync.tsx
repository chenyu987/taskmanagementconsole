import { useQuery } from "convex/react";
import { useEffect } from "react";
import { api } from "../../convex/_generated/api";
import { activateLocale, isLocale } from "./i18n";

/** 登录后以账号上记的语言为准（换了设备也一致）。账号上还没记过就保持当前语言。 */
export function LocaleSync() {
  const saved = useQuery(api.prefs.get);
  useEffect(() => {
    if (saved && isLocale(saved.locale)) void activateLocale(saved.locale);
  }, [saved]);
  return null;
}
