/** 邮箱统一小写、去首尾空格后再存储和比较。 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
