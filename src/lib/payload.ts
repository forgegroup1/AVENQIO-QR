export type ContentKind =
  | "url"
  | "wifi"
  | "text"
  | "email"
  | "phone"
  | "vcard"
  | "whatsapp"
  | "sms"
  | "location"
  | "event";

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

export interface VCardContent {
  firstName: string;
  lastName: string;
  organization: string;
  title: string;
  phone: string;
  email: string;
  website: string;
}

export interface WhatsAppContent {
  number: string;
  message: string;
}

export interface SmsContent {
  number: string;
  message: string;
}

export interface LocationContent {
  query: string;
  latitude: string;
  longitude: string;
}

export interface EventContent {
  title: string;
  start: string;
  end: string;
  location: string;
  details: string;
}

export interface ContentState {
  url: UrlContent;
  wifi: WifiContent;
  text: TextContent;
  email: EmailContent;
  phone: PhoneContent;
  vcard: VCardContent;
  whatsapp: WhatsAppContent;
  sms: SmsContent;
  location: LocationContent;
  event: EventContent;
}

export const emptyContent = (): ContentState => ({
  url: { url: "" },
  wifi: { ssid: "", password: "", security: "WPA", hidden: false },
  text: { text: "" },
  email: { address: "", subject: "", body: "" },
  phone: { number: "" },
  vcard: {
    firstName: "",
    lastName: "",
    organization: "",
    title: "",
    phone: "",
    email: "",
    website: "",
  },
  whatsapp: { number: "", message: "" },
  sms: { number: "", message: "" },
  location: { query: "", latitude: "", longitude: "" },
  event: { title: "", start: "", end: "", location: "", details: "" },
});

function escapeWifi(value: string): string {
  return value.replace(/([\\;,:"])/g, "\\$1");
}

function escapeVCard(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([;,])/g, "\\$1");
}

export function digits(value: string): string {
  return value.replace(/[^\d]/g, "");
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

function compactPhone(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const compact = trimmed.replace(/[^\d+]/g, "");
  return compact.replace(/(?!^)\+/g, "");
}

function calendarStamp(local: string): string | null {
  if (!local) return null;
  const match = local.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return null;
  return `${match[1]}${match[2]}${match[3]}T${match[4]}${match[5]}00`;
}

function addHours(local: string, hours: number): string | null {
  const date = new Date(local);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(date.getHours() + hours);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}00`;
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
      const number = compactPhone(content.phone.number);
      return number ? `tel:${number}` : "";
    }
    case "vcard": {
      const card = content.vcard;
      const name = [card.firstName.trim(), card.lastName.trim()].filter(Boolean).join(" ");
      if (!name && !card.organization.trim() && !card.phone.trim() && !card.email.trim()) return "";
      const lines = [
        "BEGIN:VCARD",
        "VERSION:3.0",
        `N:${escapeVCard(card.lastName.trim())};${escapeVCard(card.firstName.trim())};;;`,
        `FN:${escapeVCard(name || card.organization.trim())}`,
      ];
      if (card.organization.trim()) lines.push(`ORG:${escapeVCard(card.organization.trim())}`);
      if (card.title.trim()) lines.push(`TITLE:${escapeVCard(card.title.trim())}`);
      if (card.phone.trim()) lines.push(`TEL;TYPE=CELL:${compactPhone(card.phone)}`);
      if (card.email.trim()) lines.push(`EMAIL:${escapeVCard(card.email.trim())}`);
      if (card.website.trim()) lines.push(`URL:${escapeVCard(normalizeUrl(card.website))}`);
      lines.push("END:VCARD");
      return lines.join("\n");
    }
    case "whatsapp": {
      const number = digits(content.whatsapp.number);
      if (!number) return "";
      const message = content.whatsapp.message.trim();
      return `https://wa.me/${number}${message ? `?text=${encodeURIComponent(message)}` : ""}`;
    }
    case "sms": {
      const number = compactPhone(content.sms.number);
      if (!number) return "";
      const message = content.sms.message.trim();
      return `sms:${number}${message ? `?body=${encodeURIComponent(message)}` : ""}`;
    }
    case "location": {
      const lat = content.location.latitude.trim();
      const lng = content.location.longitude.trim();
      if (lat && lng && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
        return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
      }
      const query = content.location.query.trim();
      if (!query) return "";
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
    }
    case "event": {
      const title = content.event.title.trim();
      const start = calendarStamp(content.event.start);
      if (!title || !start) return "";
      const end = calendarStamp(content.event.end) ?? addHours(content.event.start, 1);
      if (!end) return "";
      const params = new URLSearchParams({
        action: "TEMPLATE",
        text: title,
        dates: `${start}/${end}`,
      });
      if (content.event.details.trim()) params.set("details", content.event.details.trim());
      if (content.event.location.trim()) params.set("location", content.event.location.trim());
      return `https://calendar.google.com/calendar/render?${params.toString()}`;
    }
  }
}

export function payloadLabel(kind: ContentKind, content: ContentState): string {
  switch (kind) {
    case "url":
      return content.url.url.trim();
    case "wifi":
      return content.wifi.ssid.trim();
    case "text":
      return content.text.text.trim().slice(0, 80);
    case "email":
      return content.email.address.trim();
    case "phone":
      return content.phone.number.trim();
    case "vcard":
      return [content.vcard.firstName, content.vcard.lastName, content.vcard.organization]
        .map((part) => part.trim())
        .filter(Boolean)
        .join(" ");
    case "whatsapp":
      return content.whatsapp.number.trim();
    case "sms":
      return content.sms.number.trim();
    case "location":
      return content.location.query.trim() || `${content.location.latitude}, ${content.location.longitude}`;
    case "event":
      return content.event.title.trim();
  }
}
