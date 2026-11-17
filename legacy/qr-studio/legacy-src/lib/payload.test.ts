import { describe, expect, it } from "vitest";
import { buildPayload, emptyContent, isLikelyUrl, normalizeUrl } from "./payload";

describe("normalizeUrl", () => {
  it("adds https when the scheme is missing", () => {
    expect(normalizeUrl("avenqio.com")).toBe("https://avenqio.com");
  });

  it("keeps an existing scheme", () => {
    expect(normalizeUrl("http://example.com/a")).toBe("http://example.com/a");
  });
});

describe("buildPayload", () => {
  it("builds a wifi payload and escapes reserved characters", () => {
    const content = emptyContent();
    content.wifi = {
      ssid: "Cafe;Guest",
      password: "p:a\\ss",
      security: "WPA",
      hidden: true,
    };
    expect(buildPayload("wifi", content)).toBe(
      "WIFI:T:WPA;S:Cafe\\;Guest;P:p\\:a\\\\ss;H:true;;",
    );
  });

  it("omits the wifi password for open networks", () => {
    const content = emptyContent();
    content.wifi = { ssid: "Lobby", password: "ignored", security: "nopass", hidden: false };
    expect(buildPayload("wifi", content)).toBe("WIFI:T:nopass;S:Lobby;P:;H:false;;");
  });

  it("builds a mailto payload", () => {
    const content = emptyContent();
    content.email = { address: "hi@avenqio.com", subject: "Hello", body: "Line 1" };
    expect(buildPayload("email", content)).toBe(
      "mailto:hi@avenqio.com?subject=Hello&body=Line+1",
    );
  });

  it("builds a tel payload", () => {
    const content = emptyContent();
    content.phone.number = "+39 333 123 4567";
    expect(buildPayload("phone", content)).toBe("tel:+393331234567");
  });

  it("builds a vcard, whatsapp link, map link, and calendar link", () => {
    const content = emptyContent();
    content.vcard = {
      firstName: "Ada",
      lastName: "Lovelace",
      organization: "AVENQIO",
      title: "Builder",
      phone: "+39 333",
      email: "ada@avenqio.com",
      website: "avenqio.com",
    };
    expect(buildPayload("vcard", content)).toContain("FN:Ada Lovelace");
    expect(buildPayload("vcard", content)).toContain("URL:https://avenqio.com");

    content.whatsapp = { number: "+39 333 111", message: "Ciao" };
    expect(buildPayload("whatsapp", content)).toBe("https://wa.me/39333111?text=Ciao");

    content.location = { query: "", latitude: "45.46", longitude: "9.19" };
    expect(buildPayload("location", content)).toContain("query=45.46%2C9.19");

    content.event = {
      title: "Demo",
      start: "2026-11-04T18:30",
      end: "",
      location: "Milan",
      details: "",
    };
    expect(buildPayload("event", content)).toContain("text=Demo");
    expect(buildPayload("event", content)).toContain("dates=20261104T183000%2F20261104T193000");
  });

  it("returns an empty string when required fields are blank", () => {
    const content = emptyContent();
    expect(buildPayload("url", content)).toBe("");
    expect(buildPayload("text", content)).toBe("");
    expect(buildPayload("email", content)).toBe("");
  });
});

describe("isLikelyUrl", () => {
  it("accepts http and https only", () => {
    expect(isLikelyUrl("https://avenqio.com")).toBe(true);
    expect(isLikelyUrl("javascript:alert(1)")).toBe(false);
  });
});
