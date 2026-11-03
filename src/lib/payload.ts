export type ContentKind = "url" | "wifi" | "text" | "email" | "phone";

export type WifiSecurity = "WPA" | "WEP" | "nopass";

export interface UrlContent {
  url: string;
}

export interface WifiContent {
  ssid: string;
  password: string;
  security: WifiSecurity;
  hidden: boolean;
}

export interface TextContent {
  text: string;
}

export interface EmailContent {
  address: string;
  subject: string;
  body: string;
}

export interface PhoneContent {
  number: string;
}

export interface ContentState {
  url: UrlContent;
  wifi: WifiContent;
  text: TextContent;
  email: EmailContent;
  phone: PhoneContent;
}

export const emptyContent = (): ContentState => ({
  url: { url: "" },
  wifi: { ssid: "", password: "", security: "WPA", hidden: false },
  text: { text: "" },
  email: { address: "", subject: "", body: "" },
  phone: { number: "" },
});

function escapeWifi(value: string): string {
  return value.replace(/([\\;,:"])/g, "\\$1");
}

export function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function isLikelyUrl(value: string): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function buildPayload(kind: ContentKind, content: ContentState): string {
  switch (kind) {
    case "url":
      return normalizeUrl(content.url.url);
    case "wifi": {
      const { ssid, password, security, hidden } = content.wifi;
      if (!ssid.trim()) return "";
      const type = security === "nopass" ? "nopass" : security;
      const pass = security === "nopass" ? "" : password;
      return `WIFI:T:${type};S:${escapeWifi(ssid.trim())};P:${escapeWifi(pass)};H:${hidden ? "true" : "false"};;`;
    }
    case "text":
      return content.text.text.trim();
    case "email": {
      const address = content.email.address.trim();
      if (!address) return "";
      const params = new URLSearchParams();
      if (content.email.subject.trim()) params.set("subject", content.email.subject.trim());
      if (content.email.body.trim()) params.set("body", content.email.body.trim());
      const query = params.toString();
      return `mailto:${address}${query ? `?${query}` : ""}`;
    }
    case "phone": {
      const number = content.phone.number.trim();
      if (!number) return "";
      const compact = number.replace(/[^\d+]/g, "");
      return compact ? `tel:${compact}` : "";
    }
  }
}

export function contentHint(kind: ContentKind): string {
  switch (kind) {
    case "url":
      return "Opens a website when scanned.";
    case "wifi":
      return "Joins a Wi-Fi network on supported phones.";
    case "text":
      return "Shows plain text after scanning.";
    case "email":
      return "Opens a new email draft.";
    case "phone":
      return "Starts a phone call.";
  }
}
