export function redactSensitive(text: string): string {
  return text
    .replace(/\b(?:\d{17}[\dXx]|\d{15})\b/g, "[证件号码已隐藏]")
    .replace(/\b1[3-9]\d{9}\b/g, "[手机号已隐藏]")
    .replace(/\b[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}\b/g, "[邮箱已隐藏]")
    .replace(/\b\d{16,19}\b/g, "[银行卡号已隐藏]")
    .replace(/((?:密码|密钥|token|api[_ -]?key)\s*[:：=]\s*)[^\s,，;；]+/gi, "$1[已隐藏]");
}

export function isSensitiveField(label: string) {
  return /身份证|证件|手机|电话|邮箱|银行卡|账户|密码|密钥|住址|地址/.test(label);
}
