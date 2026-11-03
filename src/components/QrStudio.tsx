import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import QRCodeStyling, { type Options } from "qr-code-styling";
import { contrastRatio } from "../lib/contrast";
import {
  buildPayload,
  contentHint,
  emptyContent,
  isLikelyUrl,
  type ContentKind,
  type ContentState,
  type WifiSecurity,
} from "../lib/payload";

type StyleId = "classic" | "rounded" | "dots" | "classy" | "fluid";

const STYLES: Record<
  StyleId,
  {
    label: string;
    dots: NonNullable<Options["dotsOptions"]>["type"];
    corners: NonNullable<Options["cornersSquareOptions"]>["type"];
    cornerDots: NonNullable<Options["cornersDotOptions"]>["type"];
  }
> = {
  classic: { label: "Classic", dots: "square", corners: "square", cornerDots: "square" },
  rounded: { label: "Rounded", dots: "rounded", corners: "extra-rounded", cornerDots: "dot" },
  dots: { label: "Dots", dots: "dots", corners: "dot", cornerDots: "dot" },
  classy: { label: "Classy", dots: "classy-rounded", corners: "extra-rounded", cornerDots: "dot" },
  fluid: { label: "Fluid", dots: "extra-rounded", corners: "extra-rounded", cornerDots: "dot" },
};

const KINDS: { id: ContentKind; label: string }[] = [
  { id: "url", label: "Website" },
  { id: "wifi", label: "Wi-Fi" },
  { id: "text", label: "Text" },
  { id: "email", label: "Email" },
  { id: "phone", label: "Phone" },
];

const fieldClass =
  "w-full rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-sm text-white placeholder:text-white/30 outline-none transition focus:border-violet-400/70 focus:ring-2 focus:ring-violet-500/30";

function toBlob(data: unknown): Blob | null {
  if (!data) return null;
  if (data instanceof Blob) return data;
  return null;
}

export function QrStudio() {
  const [kind, setKind] = useState<ContentKind>("url");
  const [content, setContent] = useState<ContentState>(emptyContent);
  const [foreground, setForeground] = useState("#5B21B6");
  const [background, setBackground] = useState("#F7F4FF");
  const [style, setStyle] = useState<StyleId>("rounded");
  const [logo, setLogo] = useState<string | null>(null);
  const [logoName, setLogoName] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState<"png" | "svg" | "copy" | null>(null);

  const frameRef = useRef<HTMLDivElement>(null);
  const qrRef = useRef<QRCodeStyling | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const statusId = useId();

  const payload = useMemo(() => buildPayload(kind, content), [kind, content]);
  const ratio = contrastRatio(foreground, background);
  const lowContrast = ratio < 3;
  const urlWarning = kind === "url" && payload !== "" && !isLikelyUrl(payload);
  const preset = STYLES[style];

  const options = useMemo<Options>(
    () => ({
      width: 640,
      height: 640,
      type: "svg",
      data: payload || " ",
      margin: 16,
      image: logo ?? undefined,
      qrOptions: {
        errorCorrectionLevel: logo ? "H" : "Q",
      },
      dotsOptions: { color: foreground, type: preset.dots },
      backgroundOptions: { color: background },
      cornersSquareOptions: { color: foreground, type: preset.corners },
      cornersDotOptions: { color: foreground, type: preset.cornerDots },
      imageOptions: {
        crossOrigin: "anonymous",
        margin: 8,
        imageSize: 0.34,
        hideBackgroundDots: true,
      },
    }),
    [payload, logo, foreground, background, preset],
  );

  useEffect(() => {
    const node = frameRef.current;
    if (!node) return;
    const qr = new QRCodeStyling(options);
    qrRef.current = qr;
    node.replaceChildren();
    qr.append(node);
    return () => {
      qrRef.current = null;
    };
  }, []);

  useEffect(() => {
    qrRef.current?.update(options);
  }, [options]);

  function announce(message: string) {
    setStatus(message);
  }

  async function download(extension: "png" | "svg") {
    if (!payload || !qrRef.current) {
      announce("Add content before exporting.");
      return;
    }
    setBusy(extension);
    try {
      await qrRef.current.download({ name: "avenqio-qr", extension });
      announce(`Saved avenqio-qr.${extension}.`);
    } catch {
      announce("Export failed. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function copyImage() {
    if (!payload || !qrRef.current) {
      announce("Add content before copying.");
      return;
    }
    setBusy("copy");
    try {
      const blob = toBlob(await qrRef.current.getRawData("png"));
      if (!blob || !navigator.clipboard || typeof ClipboardItem === "undefined") {
        announce("Clipboard image copy is not available in this browser. Download a PNG instead.");
        return;
      }
      const png = blob.type === "image/png" ? blob : new Blob([blob], { type: "image/png" });
      await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
      announce("QR code copied to the clipboard.");
    } catch {
      announce("Could not copy the image. Download a PNG instead.");
    } finally {
      setBusy(null);
    }
  }

  function onLogo(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      announce("Choose an image file for the logo.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      announce("Logo must be smaller than 2 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setLogo(typeof reader.result === "string" ? reader.result : null);
      setLogoName(file.name);
      announce("Logo added to the center of the code.");
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
      <section className="rise rounded-3xl border border-white/10 bg-white/[0.03] p-5 shadow-[0_30px_80px_-40px_rgba(139,92,246,0.55)] backdrop-blur-md sm:p-7">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Create</h2>
            <p className="mt-1 text-sm text-mist">{contentHint(kind)}</p>
          </div>
          <p className="text-xs tracking-wide text-lilac/80 uppercase">Private · on this device</p>
        </div>

        <div
          role="tablist"
          aria-label="QR content type"
          className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5"
        >
          {KINDS.map((item) => {
            const selected = kind === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                id={`tab-${item.id}`}
                aria-selected={selected}
                aria-controls="qr-panel"
                className={`rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  selected
                    ? "bg-violet-500 text-white shadow-[0_8px_24px_-12px_rgba(139,92,246,0.9)]"
                    : "bg-white/5 text-mist hover:bg-white/10 hover:text-white"
                }`}
                onClick={() => setKind(item.id)}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        <div
          role="tabpanel"
          id="qr-panel"
          aria-labelledby={`tab-${kind}`}
          className="mt-5 space-y-4"
        >
          {kind === "url" && (
            <Field label="Website address" htmlFor="url">
              <input
                id="url"
                className={fieldClass}
                inputMode="url"
                autoComplete="url"
                placeholder="https://avenqio.com"
                value={content.url.url}
                onChange={(event) =>
                  setContent((current) => ({
                    ...current,
                    url: { url: event.target.value },
                  }))
                }
              />
              {urlWarning && (
                <p className="text-xs text-amber-200">This does not look like a web address.</p>
              )}
            </Field>
          )}

          {kind === "wifi" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Network name" htmlFor="ssid">
                <input
                  id="ssid"
                  className={fieldClass}
                  value={content.wifi.ssid}
                  autoComplete="off"
                  onChange={(event) =>
                    setContent((current) => ({
                      ...current,
                      wifi: { ...current.wifi, ssid: event.target.value },
                    }))
                  }
                />
              </Field>
              <Field label="Security" htmlFor="security">
                <select
                  id="security"
                  className={fieldClass}
                  value={content.wifi.security}
                  onChange={(event) =>
                    setContent((current) => ({
                      ...current,
                      wifi: {
                        ...current.wifi,
                        security: event.target.value as WifiSecurity,
                      },
                    }))
                  }
                >
                  <option value="WPA">WPA / WPA2 / WPA3</option>
                  <option value="WEP">WEP</option>
                  <option value="nopass">None</option>
                </select>
              </Field>
              {content.wifi.security !== "nopass" && (
                <Field label="Password" htmlFor="wifi-pass">
                  <input
                    id="wifi-pass"
                    type="text"
                    className={fieldClass}
                    autoComplete="off"
                    value={content.wifi.password}
                    onChange={(event) =>
                      setContent((current) => ({
                        ...current,
                        wifi: { ...current.wifi, password: event.target.value },
                      }))
                    }
                  />
                </Field>
              )}
              <label className="flex items-center gap-3 self-end rounded-xl border border-white/10 bg-black/20 px-3.5 py-2.5 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-violet-500"
                  checked={content.wifi.hidden}
                  onChange={(event) =>
                    setContent((current) => ({
                      ...current,
                      wifi: { ...current.wifi, hidden: event.target.checked },
                    }))
                  }
                />
                Hidden network
              </label>
            </div>
          )}

          {kind === "text" && (
            <Field label="Text" htmlFor="text">
              <textarea
                id="text"
                rows={5}
                className={fieldClass}
                maxLength={1200}
                placeholder="A note, a code, a message."
                value={content.text.text}
                onChange={(event) =>
                  setContent((current) => ({
                    ...current,
                    text: { text: event.target.value },
                  }))
                }
              />
            </Field>
          )}

          {kind === "email" && (
            <div className="grid gap-4">
              <Field label="Email address" htmlFor="email">
                <input
                  id="email"
                  type="email"
                  className={fieldClass}
                  autoComplete="email"
                  placeholder="hello@avenqio.com"
                  value={content.email.address}
                  onChange={(event) =>
                    setContent((current) => ({
                      ...current,
                      email: { ...current.email, address: event.target.value },
                    }))
                  }
                />
              </Field>
              <Field label="Subject" htmlFor="subject">
                <input
                  id="subject"
                  className={fieldClass}
                  value={content.email.subject}
                  onChange={(event) =>
                    setContent((current) => ({
                      ...current,
                      email: { ...current.email, subject: event.target.value },
                    }))
                  }
                />
              </Field>
              <Field label="Message" htmlFor="body">
                <textarea
                  id="body"
                  rows={3}
                  className={fieldClass}
                  value={content.email.body}
                  onChange={(event) =>
                    setContent((current) => ({
                      ...current,
                      email: { ...current.email, body: event.target.value },
                    }))
                  }
                />
              </Field>
            </div>
          )}

          {kind === "phone" && (
            <Field label="Phone number" htmlFor="phone">
              <input
                id="phone"
                type="tel"
                className={fieldClass}
                autoComplete="tel"
                placeholder="+39 333 000 0000"
                value={content.phone.number}
                onChange={(event) =>
                  setContent((current) => ({
                    ...current,
                    phone: { number: event.target.value },
                  }))
                }
              />
            </Field>
          )}
        </div>

        <div className="mt-8 border-t border-white/10 pt-6">
          <h3 className="text-sm font-semibold tracking-wide text-lilac uppercase">Style</h3>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5" role="radiogroup" aria-label="QR style">
            {(Object.keys(STYLES) as StyleId[]).map((id) => {
              const selected = style === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setStyle(id)}
                  className={`rounded-2xl border px-2 py-3 text-center text-xs font-medium transition ${
                    selected
                      ? "border-violet-400/80 bg-violet-500/15 text-white"
                      : "border-white/10 bg-black/20 text-mist hover:border-white/25"
                  }`}
                >
                  <StyleGlyph id={id} />
                  <span className="mt-2 block">{STYLES[id].label}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <ColorField
              id="foreground"
              label="Foreground"
              value={foreground}
              onChange={setForeground}
            />
            <ColorField
              id="background"
              label="Background"
              value={background}
              onChange={setBackground}
            />
          </div>
          {lowContrast && (
            <p className="mt-3 text-sm text-amber-200" role="status">
              These colors are close together. A scanner may struggle to read the code.
            </p>
          )}

          <div className="mt-5">
            <p className="text-sm font-medium" id="logo-label">
              Center logo
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="sr-only"
                aria-labelledby="logo-label"
                onChange={(event) => {
                  onLogo(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
              <button
                type="button"
                className="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-medium hover:bg-white/10"
                onClick={() => fileRef.current?.click()}
              >
                {logo ? "Replace logo" : "Upload logo"}
              </button>
              {logo && (
                <button
                  type="button"
                  className="rounded-xl px-3 py-2.5 text-sm text-mist hover:text-white"
                  onClick={() => {
                    setLogo(null);
                    setLogoName("");
                    announce("Logo removed.");
                  }}
                >
                  Remove
                </button>
              )}
              <span className="text-xs text-mist">{logoName || "PNG, JPG, WEBP, or SVG · 2 MB max"}</span>
            </div>
          </div>
        </div>
      </section>

      <aside className="rise rise-delay lg:sticky lg:top-6">
        <div className="rounded-3xl border border-white/10 bg-[#120e1b] p-5 shadow-[0_30px_90px_-36px_rgba(139,92,246,0.7)] sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight">Preview</h2>
            <span className="text-xs text-mist">{payload ? "Live" : "Waiting for content"}</span>
          </div>
          <div className="relative overflow-hidden rounded-2xl bg-black/40 p-4">
            <div
              className="pointer-events-none absolute inset-6 rounded-[28px] border border-violet-300/20"
              style={{ animation: "pulse-ring 4.5s ease-in-out infinite" }}
              aria-hidden="true"
            />
            <div
              ref={frameRef}
              className={`qr-frame relative mx-auto aspect-square w-full max-w-[320px] transition ${
                payload ? "opacity-100" : "opacity-30"
              }`}
              aria-label={payload ? "QR code preview" : "QR code preview is empty"}
              role="img"
            />
            {!payload && (
              <p className="pointer-events-none absolute inset-x-8 bottom-8 text-center text-sm text-white/80">
                Fill in the details and the code updates instantly.
              </p>
            )}
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2">
            <Action label="PNG" busy={busy === "png"} disabled={!payload} onClick={() => download("png")} />
            <Action label="SVG" busy={busy === "svg"} disabled={!payload} onClick={() => download("svg")} />
            <Action label="Copy" busy={busy === "copy"} disabled={!payload} onClick={copyImage} />
          </div>
          <p id={statusId} className="mt-3 min-h-5 text-sm text-lilac" role="status" aria-live="polite">
            {status}
          </p>
        </div>
      </aside>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="grid gap-1.5 text-sm font-medium">
      {label}
      {children}
    </label>
  );
}

function ColorField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const hexOk = /^#[0-9a-fA-F]{6}$/.test(value);
  return (
    <div className="grid gap-1.5">
      <label htmlFor={`${id}-hex`} className="text-sm font-medium">
        {label}
      </label>
      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 p-1.5">
        <input
          id={id}
          aria-label={`${label} color picker`}
          type="color"
          value={hexOk ? value : "#000000"}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
          className="h-10 w-12 cursor-pointer rounded-lg border-0 bg-transparent"
        />
        <input
          id={`${id}-hex`}
          value={value}
          spellCheck={false}
          maxLength={7}
          onChange={(event) => {
            const next = event.target.value.startsWith("#")
              ? event.target.value
              : `#${event.target.value}`;
            onChange(next.toUpperCase());
          }}
          className="w-full bg-transparent px-1 font-mono text-sm tracking-wide outline-none"
        />
      </div>
    </div>
  );
}

function Action({
  label,
  onClick,
  disabled,
  busy,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  busy: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className="rounded-xl bg-white px-3 py-2.5 text-sm font-semibold text-[#1a1028] transition hover:bg-lilac disabled:cursor-not-allowed disabled:bg-white/15 disabled:text-white/40"
    >
      {busy ? "…" : label}
    </button>
  );
}

function StyleGlyph({ id }: { id: StyleId }) {
  const radius = id === "classic" ? "1px" : id === "dots" ? "999px" : id === "fluid" ? "6px" : "3px";
  return (
    <span className="mx-auto grid w-9 grid-cols-3 gap-0.5" aria-hidden="true">
      {Array.from({ length: 9 }, (_, index) => (
        <span
          key={index}
          className="aspect-square bg-current"
          style={{
            borderRadius: radius,
            opacity: index === 4 ? 0.25 : 1,
          }}
        />
      ))}
    </span>
  );
}
