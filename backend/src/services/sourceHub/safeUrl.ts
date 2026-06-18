import { isIP } from "node:net";
import { HttpError } from "../../middleware/error.js";

const blockedHostnames = new Set(["localhost", "localhost.localdomain"]);

export function assertSafePublicHttpUrl(value: string): string {
  let parsed: URL;

  try {
    parsed = new URL(value.trim());
  } catch {
    throw new HttpError(400, "UNSAFE_SOURCE_URL", "Source URL is invalid.");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new HttpError(400, "UNSAFE_SOURCE_URL", "Only HTTP and HTTPS source URLs are allowed.");
  }

  if (parsed.username || parsed.password) {
    throw new HttpError(400, "UNSAFE_SOURCE_URL", "Source URL credentials are not allowed.");
  }

  assertPublicHostname(parsed.hostname);
  parsed.hash = "";
  return parsed.toString();
}

export function safeDomainFromUrl(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

export function assertPublicSourceConfig(config: Record<string, unknown> | undefined): void {
  if (!config) {
    return;
  }

  for (const key of ["url", "sourceUrl", "feedUrl", "sitemapUrl"]) {
    const value = config[key];

    if (typeof value === "string" && value.trim()) {
      assertSafePublicHttpUrl(value);
    }
  }

  const urls = config.urls;

  if (Array.isArray(urls)) {
    for (const url of urls) {
      if (typeof url === "string" && url.trim()) {
        assertSafePublicHttpUrl(url);
      }
    }
  }
}

function assertPublicHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (!normalized || blockedHostnames.has(normalized) || normalized.endsWith(".localhost")) {
    throw new HttpError(400, "UNSAFE_SOURCE_URL", "Localhost source URLs are not allowed.");
  }

  const ipVersion = isIP(normalized);

  if (ipVersion === 4 && isPrivateIpv4(normalized)) {
    throw new HttpError(400, "UNSAFE_SOURCE_URL", "Private network source URLs are not allowed.");
  }

  if (ipVersion === 6 && isPrivateIpv6(normalized)) {
    throw new HttpError(400, "UNSAFE_SOURCE_URL", "Private network source URLs are not allowed.");
  }
}

function isPrivateIpv4(value: string) {
  const parts = value.split(".").map((part) => Number(part));
  const [a = 0, b = 0] = parts;

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

function isPrivateIpv6(value: string) {
  return (
    value === "::1" ||
    value.startsWith("fc") ||
    value.startsWith("fd") ||
    value.startsWith("fe80") ||
    value === "::"
  );
}
