import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "../config/env.js";
import { HttpError } from "../middleware/error.js";

const commonEmailDomains = [
  "qq.com",
  "163.com",
  "126.com",
  "sina.com",
  "sohu.com",
  "aliyun.com",
  "foxmail.com",
  "tencent.com",
  "feishu.cn",
  "larkoffice.com",
  "gmail.com",
  "outlook.com",
  "hotmail.com",
  "icloud.com",
  "proton.me",
  "zoho.com",
  "yahoo.com"
];

const disposableDomainSeeds = [
  "10minutemail.com",
  "20minutemail.com",
  "33mail.com",
  "dispostable.com",
  "emailondeck.com",
  "fakeinbox.com",
  "getnada.com",
  "guerrillamail.com",
  "maildrop.cc",
  "mailinator.com",
  "moakt.com",
  "sharklasers.com",
  "tempmail.com",
  "temp-mail.org",
  "throwawaymail.com",
  "trashmail.com",
  "yopmail.com",
  "mailnesia.com",
  "mintemail.com",
  "mytemp.email",
  "burnermail.io",
  "inboxkitten.com",
  "mail-temporaire.fr",
  "tempmailo.com",
  "tmpmail.org",
  "spamgourmet.com",
  "mailcatch.com",
  "mailsac.com",
  "temporary-mail.net",
  "tempr.email",
  "dropmail.me",
  "getairmail.com",
  "mailpoof.com",
  "mail.tm",
  "anonaddy.com",
  "simplelogin.com",
  "tempmail.plus",
  "mail7.io",
  "linshiyouxiang.net",
  "bccto.me",
  "mailhazard.com",
  "emailtemporanea.com",
  "correo.blogos.net",
  "mailforspam.com",
  "trashmail.net",
  "mytrashmail.com",
  "spambog.com",
  "spam4.me",
  "tempinbox.com",
  "nowmymail.com",
  "jetable.org"
];

const disposableDomains = new Set(disposableDomainSeeds);

const sensitiveWords = [
  "admin",
  "administrator",
  "root",
  "system",
  "official",
  "support",
  "客服",
  "管理员",
  "系统",
  "官方",
  "赌博",
  "博彩",
  "诈骗",
  "外挂",
  "色情",
  "毒品",
  "洗钱",
  "黑产",
  "钓鱼",
  "木马",
  "暴力",
  "灰产",
  "刷单",
  "薅羊毛"
];

const weakPasswordSeeds = [
  "12345678",
  "123456789",
  "1234567890",
  "password",
  "password1",
  "admin123",
  "admin123456",
  "qwerty123",
  "abc12345",
  "11111111",
  "00000000",
  "iloveyou",
  "sunshine",
  "p@ssw0rd",
  "passw0rd",
  "welcome1",
  "zaq12wsx",
  "1qaz2wsx",
  "qwer1234",
  "asdf1234",
  "abcd1234",
  "88888888",
  "66666666",
  "5201314a",
  "citeox123"
];

const weakPasswords = new Set([
  ...weakPasswordSeeds,
  ...weakPasswordSeeds.map((value) => `${value}!`),
  ...Array.from({ length: 200 }, (_, index) => `password${index + 1}`),
  ...Array.from({ length: 200 }, (_, index) => `admin${1000 + index}`)
]);

const industryTerms = [
  "制造业",
  "智能制造",
  "医疗健康",
  "医疗器械",
  "教育培训",
  "K12教育",
  "科技互联网",
  "SaaS",
  "金融服务",
  "投资理财",
  "零售电商",
  "跨境电商",
  "餐饮美食",
  "房地产",
  "家居装修",
  "交通运输",
  "能源环保",
  "本地生活",
  "企业服务",
  "运营",
  "销售",
  "市场营销",
  "内容运营",
  "产品经理",
  "技术开发",
  "设计",
  "人力资源",
  "法律服务",
  "咨询服务",
  "旅游服务"
];

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function normalizePhone(phone?: string | null) {
  return (phone ?? "").replace(/\D/g, "");
}

export function normalizeUsername(username: string) {
  return username.trim();
}

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function hashEmail(email: string) {
  return sha256(normalizeEmail(email));
}

export function hashPhone(phone: string) {
  return sha256(normalizePhone(phone));
}

export function encryptSensitive(value: string) {
  const plain = value.trim();
  const key = encryptionKey();
  if (!key) {
    return plain;
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptSensitive(value?: string | null) {
  if (!value) {
    return value ?? null;
  }

  if (!value.startsWith("v1:")) {
    return value;
  }

  const key = encryptionKey();
  if (!key) {
    return null;
  }

  try {
    const [, ivText, tagText, encryptedText] = value.split(":");
    if (!ivText || !tagText || !encryptedText) {
      return null;
    }
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivText, "base64"));
    decipher.setAuthTag(Buffer.from(tagText, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedText, "base64")),
      decipher.final()
    ]).toString("utf8");
  } catch {
    return null;
  }
}

export function assertEmailAllowed(email: string) {
  const normalized = normalizeEmail(email);
  const domain = normalized.split("@")[1] ?? "";

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new HttpError(400, "VALIDATION_ERROR", "邮箱格式不正确，请输入有效邮箱，例如 name@qq.com。");
  }

  if (disposableDomains.has(domain)) {
    throw new HttpError(400, "DISPOSABLE_EMAIL_NOT_ALLOWED", "请使用常用邮箱注册，暂不支持临时邮箱。");
  }
}

export function emailDomainSuggestion(email: string) {
  const normalized = normalizeEmail(email);
  const [name, domain] = normalized.split("@");
  if (!name || !domain) {
    return null;
  }

  let best: { domain: string; distance: number } | null = null;
  for (const candidate of commonEmailDomains) {
    const distance = levenshtein(domain, candidate);
    if (distance <= 2 && (!best || distance < best.distance)) {
      best = { domain: candidate, distance };
    }
  }

  return best && best.domain !== domain ? `${name}@${best.domain}` : null;
}

export function validateUsername(username: string) {
  const value = normalizeUsername(username);
  if (!value) {
    return { valid: false, message: "请输入账号名称。" };
  }
  if (value.length < 2 || value.length > 20) {
    return { valid: false, message: "账号名称需要 2-20 个字符。" };
  }
  if (!/^[\u4e00-\u9fa5A-Za-z0-9_]+$/.test(value)) {
    return { valid: false, message: "账号名称仅支持中文、英文、数字和下划线。" };
  }
  if (/^\d+$/.test(value)) {
    return { valid: false, message: "账号名称不能为纯数字。" };
  }
  if (containsSensitiveWord(value)) {
    return { valid: false, message: "账号名称包含不当内容，请更换。" };
  }
  if (/^(aa|ab|aaa|test|ceshi|测试|用户|user)$/i.test(value) || /(.)\1{2,}/.test(value)) {
    return {
      valid: true,
      severity: "warning" as const,
      message: "账号名称过于简单，建议使用更有辨识度的名称。"
    };
  }
  return { valid: true, severity: "success" as const, message: "账号名称可用。" };
}

export function validateIndustry(industry: string) {
  const value = industry.trim();
  if (!value) {
    return { valid: false, message: "请选择或输入你的行业。" };
  }
  if (/^\d+$/.test(value) || /^[a-z]{1,4}$/i.test(value)) {
    return {
      valid: false,
      message: "行业格式不正确，请输入真实行业或岗位名称，例如制造业、医疗、运营、销售。"
    };
  }
  const matched = industryTerms.filter((term) => term.includes(value) || value.includes(term)).slice(0, 8);
  if (!matched.length) {
    return {
      valid: true,
      severity: "warning" as const,
      message: "未找到完全匹配行业，将作为自定义行业保存。",
      suggestions: industryTerms.slice(0, 8)
    };
  }
  return {
    valid: true,
    severity: "success" as const,
    message: "行业信息已识别。",
    suggestions: matched
  };
}

export function validatePhoneOrThrow(phone: string) {
  const normalized = normalizePhone(phone);
  if (!normalized) {
    throw new HttpError(400, "VALIDATION_ERROR", "手机号为必填项，请输入手机号。");
  }
  if (!/^1[3-9]\d{9}$/.test(normalized)) {
    throw new HttpError(400, "VALIDATION_ERROR", "请输入正确的 11 位中国大陆手机号。");
  }
  return normalized;
}

export function assertPasswordAllowed(password: string, username?: string) {
  if (password.length < 8 || password.length > 32) {
    throw new HttpError(400, "WEAK_PASSWORD", "密码需要 8-32 个字符。");
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new HttpError(400, "WEAK_PASSWORD", "密码至少需要同时包含字母和数字。");
  }
  const lower = password.toLowerCase();
  if (weakPasswords.has(lower)) {
    throw new HttpError(400, "WEAK_PASSWORD", "当前密码过于常见，请更换更安全的密码。");
  }
  if (username && lower.includes(username.toLowerCase())) {
    throw new HttpError(400, "WEAK_PASSWORD", "密码不能包含账号名称，请更换更安全的密码。");
  }
  if (/(.)\1{2,}/.test(password)) {
    throw new HttpError(400, "WEAK_PASSWORD", "密码不能包含连续 3 个以上相同字符。");
  }
}

export function containsSensitiveWord(value: string) {
  const normalized = value.toLowerCase();
  return sensitiveWords.some((word) => normalized.includes(word.toLowerCase()));
}

export function usernameSuggestions(base: string) {
  const clean = normalizeUsername(base).replace(/[^\u4e00-\u9fa5A-Za-z0-9_]/g, "") || "citeox";
  const suffix = String(Math.floor(100 + Math.random() * 900));
  return [`${clean}_${suffix}`, `${clean}_geo`, `${clean}_${new Date().getFullYear()}`].slice(0, 3);
}

export function publicEmail(value?: string | null) {
  const plain = decryptSensitive(value);
  if (!plain) {
    return null;
  }
  const [name, domain] = plain.split("@");
  return `${(name ?? "").slice(0, 2)}***@${domain ?? ""}`;
}

export function publicPhone(value?: string | null) {
  const plain = decryptSensitive(value);
  if (!plain) {
    return null;
  }
  const normalized = normalizePhone(plain);
  if (!normalized) {
    return null;
  }
  return `${normalized.slice(0, 3)}****${normalized.slice(-4)}`;
}

function encryptionKey() {
  if (!env.ENCRYPTION_KEY) {
    if (env.NODE_ENV === "production") {
      throw new HttpError(500, "SECURITY_CONFIG_MISSING", "服务安全配置未完成，请联系管理员。");
    }
    return null;
  }

  const key = Buffer.from(env.ENCRYPTION_KEY, "base64");
  if (key.length !== 32) {
    if (env.NODE_ENV === "production") {
      throw new HttpError(500, "SECURITY_CONFIG_INVALID", "服务安全配置不正确，请联系管理员。");
    }
    return null;
  }
  return key;
}

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, () => Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) dp[i]![0] = i;
  for (let j = 0; j <= b.length; j += 1) dp[0]![j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[a.length]![b.length]!;
}
