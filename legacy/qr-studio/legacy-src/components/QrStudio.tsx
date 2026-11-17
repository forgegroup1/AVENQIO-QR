import { useEffect, useId, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import QRCodeStyling, { type Options } from "qr-code-styling";
import { useLocale } from "../i18n";
import { contrastRatio } from "../lib/contrast";
import { forget, readHistory, remember, type HistoryEntry } from "../lib/history";
import {
  buildPayload,
  emptyContent,
  isLikelyUrl,
  payloadLabel,
  type ContentKind,
  type ContentState,
  type WifiSecurity,
} from "../lib/payload";
import type { PrintFormat } from "../lib/print";

type StyleId = "classic" | "rounded" | "dots" | "classy" | "fluid";
type Busy = "png" | "svg" | "copy" | "a6" | "a4" | null;

const STYLE_SHAPE: Record<
  StyleId,
  {
    dots: NonNullable<Options["dotsOptions"]>["type"];
    corners: NonNullable<Options["cornersSquareOptions"]>["type"];
    cornerDots: NonNullable<Options["cornersDotOptions"]>["type"];
  }
> = {
  classic: { dots: "square", corners: "square", cornerDots: "square" },
  rounded: { dots: "rounded", corners: "extra-rounded", cornerDots: "dot" },
  dots: { dots: "dots", corners: "dot", cornerDots: "dot" },
  classy: { dots: "classy-rounded", corners: "extra-rounded", cornerDots: "dot" },
  fluid: { dots: "extra-rounded", corners: "extra-rounded", cornerDots: "dot" },
};

const KINDS: ContentKind[] = [
  "url",
  "wifi",
  "text",
  "email",
  "phone",
  "vcard",
  "whatsapp",
  "sms",
  "location",
  "event",
];

const SIZES = [640, 1024, 2048] as const;

const fieldClass =
  "w-full rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-sm text-white placeholder:text-white/30 outline-none transition focus:border-violet-400/70 focus:ring-2 focus:ring-violet-500/30";

function toBlob(data: unknown): Blob | null {
  if (!data) return null;
  if (data instanceof Blob) return data;
  return null;
}

export function QrStudio() {
  const { t } = useLocale();
  const [kind, setKind] = useState<ContentKind>("url");
  const [content, setContent] = useState<ContentState>(emptyContent);
  const [foreground, setForeground] = useState("#5B21B6");
  const [background, setBackground] = useState("#F7F4FF");
  const [transparent, setTransparent] = useState(false);
  const [style, setStyle] = useState<StyleId>("rounded");
  const [exportSize, setExportSize] = useState<(typeof SIZES)[number]>(1024);
  const [frame, setFrame] = useState(false);
  const [caption, setCaption] = useState("");
  const [logo, setLogo] = useState<string | null>(null);
  const [logoName, setLogoName] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState<Busy>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const frameRef = useRef<HTMLDivElement>(null);
  const qrRef = useRef<QRCodeStyling | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const statusId = useId();

  const payload = useMemo(() => buildPayload(kind, content), [kind, content]);
  const backgroundColor = transparent ? "transparent" : background;
  const ratio = contrastRatio(foreground, transparent ? "#000000" : background);
  const lowContrast = !transparent && ratio < 3;
  const urlWarning = kind === "url" && payload !== "" && !isLikelyUrl(payload);
  const preset = STYLE_SHAPE[style];
  const shownCaption = caption.trim() || t.captionDefault;

  const options = useMemo<Options>(
    () => ({
      width: 640,
      height: 640,
      type: "svg",
      data: payload || " ",
      margin: 16,
      image: logo ?? undefined,
      qrOptions: { errorCorrectionLevel: logo ? "H" : "Q" },
      dotsOptions: { color: foreground, type: preset.dots },
      backgroundOptions: { color: backgroundColor },
      cornersSquareOptions: { color: foreground, type: preset.corners },
      cornersDotOptions: { color: foreground, type: preset.cornerDots },
      imageOptions: {
        crossOrigin: "anonymous",
        margin: 8,
        imageSize: 0.34,
        hideBackgroundDots: true,
      },
    }),
    [payload, logo, foreground, backgroundColor, preset],
  );

  useEffect(() => {
    setHistory(readHistory());
  }, []);

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

  function exporter(size: number) {
    return new QRCodeStyling({ ...options, width: size, height: size, data: payload });
  }

  function store() {
    if (!payload) return;
    setHistory(
      remember({
        kind,
        label: payloadLabel(kind, content) || kind,
        content,
        foreground,
        background,
        transparent,
        style,
        frame,
        caption,
        exportSize,
      }),
    );
  }

  async function download(extension: "png" | "svg") {
    if (!payload) {
      announce(t.needContent);
      return;
    }
    setBusy(extension);
    try {
      await exporter(exportSize).download({ name: "avenqio-qr", extension });
      store();
      announce(`${t.saved} ${extension.toUpperCase()}.`);
    } catch {
      announce(t.exportFailed);
    } finally {
      setBusy(null);
    }
  }

  async function copyImage() {
    if (!payload) {
      announce(t.needContent);
      return;
    }
    setBusy("copy");
    try {
      const blob = toBlob(await exporter(exportSize).getRawData("png"));
      if (!blob || !navigator.clipboard || typeof ClipboardItem === "undefined") {
        announce(t.copyUnavailable);
        return;
      }
      const png = blob.type === "image/png" ? blob : new Blob([blob], { type: "image/png" });
      await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
      store();
      announce(t.copied);
    } catch {
      announce(t.copyFailed);
    } finally {
      setBusy(null);
    }
  }

  async function printPdf(format: PrintFormat) {
    if (!payload) {
      announce(t.needContent);
      return;
    }
    setBusy(format);
    try {
      const blob = toBlob(await exporter(exportSize).getRawData("png"));
      if (!blob) throw new Error("empty");
      const { downloadPrintPdf } = await import("../lib/print");
      await downloadPrintPdf({
        format,
        png: blob,
        caption: frame ? shownCaption : "",
        foreground,
      });
      store();
      announce(t.pdfSaved);
    } catch {
      announce(t.exportFailed);
    } finally {
      setBusy(null);
    }
  }

  function onLogo(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      announce(t.logoType);
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      announce(t.logoSize);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setLogo(typeof reader.result === "string" ? reader.result : null);
      setLogoName(file.name);
      announce(t.logoAdded);
    };
    reader.readAsDataURL(file);
  }

  function restore(entry: HistoryEntry) {
    setKind(entry.kind);
    setContent({ ...emptyContent(), ...entry.content });
    setForeground(entry.foreground);
    setBackground(entry.background);
    setTransparent(entry.transparent);
    if (entry.style in STYLE_SHAPE) setStyle(entry.style as StyleId);
    setFrame(entry.frame);
    setCaption(entry.caption);
    if (SIZES.includes(entry.exportSize as (typeof SIZES)[number])) {
      setExportSize(entry.exportSize as (typeof SIZES)[number]);
    }
    announce(t.restored);
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
      <section className="rise rounded-3xl border border-white/10 bg-white/[0.03] p-5 shadow-[0_30px_80px_-40px_rgba(139,92,246,0.55)] backdrop-blur-md sm:p-7">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">{t.create}</h2>
            <p className="mt-1 text-sm text-mist">{t.hints[kind]}</p>
          </div>
          <p className="text-xs tracking-wide text-lilac/80 uppercase">{t.private}</p>
        </div>

        <div role="tablist" aria-label={t.create} className="mt-5 flex flex-wrap gap-2">
          {KINDS.map((id) => {
            const selected = kind === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                id={`tab-${id}`}
                aria-selected={selected}
                aria-controls="qr-panel"
                className={`rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  selected
                    ? "bg-violet-500 text-white shadow-[0_8px_24px_-12px_rgba(139,92,246,0.9)]"
                    : "bg-white/5 text-mist hover:bg-white/10 hover:text-white"
                }`}
                onClick={() => setKind(id)}
              >
                {t.kinds[id]}
              </button>
            );
          })}
        </div>

        <div role="tabpanel" id="qr-panel" aria-labelledby={`tab-${kind}`} className="mt-5 space-y-4">
          <KindFields kind={kind} content={content} setContent={setContent} urlWarning={urlWarning} />
        </div>

        <div className="mt-8 border-t border-white/10 pt-6">
          <h3 className="text-sm font-semibold tracking-wide text-lilac uppercase">{t.style}</h3>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5" role="radiogroup" aria-label={t.style}>
            {(Object.keys(STYLE_SHAPE) as StyleId[]).map((id) => {
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
                  <span className="mt-2 block">{t.styles[id]}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <ColorField id="foreground" label={t.foreground} value={foreground} onChange={setForeground} />
            <ColorField
              id="background"
              label={t.background}
              value={background}
              onChange={setBackground}
              disabled={transparent}
            />
          </div>
          <label className="mt-3 flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-violet-500"
              checked={transparent}
              onChange={(event) => setTransparent(event.target.checked)}
            />
            {t.transparent}
          </label>
          {lowContrast && (
            <p className="mt-3 text-sm text-amber-200" role="status">
              {t.contrast}
            </p>
          )}

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label={t.size} htmlFor="export-size">
              <select
                id="export-size"
                className={fieldClass}
                value={exportSize}
                onChange={(event) => setExportSize(Number(event.target.value) as (typeof SIZES)[number])}
              >
                {SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size} × {size}
                  </option>
                ))}
              </select>
            </Field>
            <label className="flex items-center gap-3 self-end rounded-xl border border-white/10 bg-black/20 px-3.5 py-2.5 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-violet-500"
                checked={frame}
                onChange={(event) => setFrame(event.target.checked)}
              />
              {t.frame}
            </label>
          </div>
          {frame && (
            <Field label={t.caption} htmlFor="caption">
              <input
                id="caption"
                className={fieldClass}
                placeholder={t.captionDefault}
                value={caption}
                onChange={(event) => setCaption(event.target.value)}
              />
            </Field>
          )}

          <div className="mt-5">
            <p className="text-sm font-medium" id="logo-label">
              {t.logo}
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
                {logo ? t.replace : t.upload}
              </button>
              {logo && (
                <button
                  type="button"
                  className="rounded-xl px-3 py-2.5 text-sm text-mist hover:text-white"
                  onClick={() => {
                    setLogo(null);
                    setLogoName("");
                    announce(t.logoRemoved);
                  }}
                >
                  {t.remove}
                </button>
              )}
              <span className="text-xs text-mist">{logoName || t.logoHint}</span>
            </div>
          </div>
        </div>

        <div className="mt-8 border-t border-white/10 pt-6">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold tracking-wide text-lilac uppercase">{t.history}</h3>
            <button
              type="button"
              className="text-sm text-lilac disabled:text-white/30"
              disabled={!payload}
              onClick={() => {
                store();
                announce(t.savedDevice);
              }}
            >
              {t.saveDevice}
            </button>
          </div>
          {history.length === 0 ? (
            <p className="mt-3 text-sm text-mist">{t.historyEmpty}</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {history.map((entry) => (
                <li key={entry.id} className="flex items-center gap-2 rounded-xl bg-black/20 px-3 py-2">
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => restore(entry)}>
                    <span className="block truncate text-sm">{entry.label}</span>
                    <span className="text-xs text-mist">{t.kinds[entry.kind]}</span>
                  </button>
                  <button
                    type="button"
                    className="text-xs text-mist hover:text-white"
                    onClick={() => setHistory(forget(entry.id))}
                  >
                    {t.removeHistory}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <aside className="rise rise-delay lg:sticky lg:top-6">
        <div className="rounded-3xl border border-white/10 bg-[#120e1b] p-5 shadow-[0_30px_90px_-36px_rgba(139,92,246,0.7)] sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight">{t.preview}</h2>
            <span className="text-xs text-mist">{payload ? t.live : t.waiting}</span>
          </div>
          <div className={`rounded-2xl p-4 ${frame ? "bg-white text-[#1a1028]" : "bg-black/40"}`}>
            <div
              ref={frameRef}
              className={`qr-frame relative mx-auto aspect-square w-full max-w-[320px] ${payload ? "opacity-100" : "opacity-30"} ${
                transparent && !frame ? "checker" : ""
              }`}
              aria-label={payload ? t.preview : t.waiting}
              role="img"
            />
            {frame && <p className="mt-3 text-center text-lg font-semibold tracking-tight">{shownCaption}</p>}
            {!payload && !frame && (
              <p className="mt-3 text-center text-sm text-white/80">{t.empty}</p>
            )}
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2">
            <Action label={t.png} busy={busy === "png"} disabled={!payload} onClick={() => download("png")} />
            <Action label={t.svg} busy={busy === "svg"} disabled={!payload} onClick={() => download("svg")} />
            <Action label={t.copy} busy={busy === "copy"} disabled={!payload} onClick={copyImage} />
            <Action label={t.pdfA6} busy={busy === "a6"} disabled={!payload} onClick={() => printPdf("a6")} />
            <Action label={t.pdfA4} busy={busy === "a4"} disabled={!payload} onClick={() => printPdf("a4")} />
          </div>
          <p id={statusId} className="mt-3 min-h-5 text-sm text-lilac" role="status" aria-live="polite">
            {status}
          </p>
        </div>
      </aside>
    </div>
  );
}

function KindFields({
  kind,
  content,
  setContent,
  urlWarning,
}: {
  kind: ContentKind;
  content: ContentState;
  setContent: Dispatch<SetStateAction<ContentState>>;
  urlWarning: boolean;
}) {
  const { t } = useLocale();
  const patch = <K extends ContentKind>(key: K, value: Partial<ContentState[K]>) =>
    setContent((current) => ({ ...current, [key]: { ...current[key], ...value } }));

  if (kind === "url") {
    return (
      <Field label={t.fields.url} htmlFor="url">
        <input
          id="url"
          className={fieldClass}
          inputMode="url"
          autoComplete="url"
          placeholder={t.placeholders.url}
          value={content.url.url}
          onChange={(event) => patch("url", { url: event.target.value })}
        />
        {urlWarning && <p className="text-xs text-amber-200">{t.urlWarning}</p>}
      </Field>
    );
  }

  if (kind === "wifi") {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.fields.ssid} htmlFor="ssid">
          <input
            id="ssid"
            className={fieldClass}
            autoComplete="off"
            value={content.wifi.ssid}
            onChange={(event) => patch("wifi", { ssid: event.target.value })}
          />
        </Field>
        <Field label={t.fields.security} htmlFor="security">
          <select
            id="security"
            className={fieldClass}
            value={content.wifi.security}
            onChange={(event) => patch("wifi", { security: event.target.value as WifiSecurity })}
          >
            <option value="WPA">{t.security.wpa}</option>
            <option value="WEP">{t.security.wep}</option>
            <option value="nopass">{t.security.none}</option>
          </select>
        </Field>
        {content.wifi.security !== "nopass" && (
          <Field label={t.fields.password} htmlFor="wifi-pass">
            <input
              id="wifi-pass"
              className={fieldClass}
              autoComplete="off"
              value={content.wifi.password}
              onChange={(event) => patch("wifi", { password: event.target.value })}
            />
          </Field>
        )}
        <label className="flex items-center gap-3 self-end rounded-xl border border-white/10 bg-black/20 px-3.5 py-2.5 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-violet-500"
            checked={content.wifi.hidden}
            onChange={(event) => patch("wifi", { hidden: event.target.checked })}
          />
          {t.hidden}
        </label>
      </div>
    );
  }

  if (kind === "text") {
    return (
      <Field label={t.fields.text} htmlFor="text">
        <textarea
          id="text"
          rows={5}
          className={fieldClass}
          maxLength={1200}
          placeholder={t.placeholders.text}
          value={content.text.text}
          onChange={(event) => patch("text", { text: event.target.value })}
        />
      </Field>
    );
  }

  if (kind === "email") {
    return (
      <div className="grid gap-4">
        <Field label={t.fields.email} htmlFor="email">
          <input
            id="email"
            type="email"
            className={fieldClass}
            autoComplete="email"
            placeholder={t.placeholders.email}
            value={content.email.address}
            onChange={(event) => patch("email", { address: event.target.value })}
          />
        </Field>
        <Field label={t.fields.subject} htmlFor="subject">
          <input
            id="subject"
            className={fieldClass}
            value={content.email.subject}
            onChange={(event) => patch("email", { subject: event.target.value })}
          />
        </Field>
        <Field label={t.fields.message} htmlFor="body">
          <textarea
            id="body"
            rows={3}
            className={fieldClass}
            value={content.email.body}
            onChange={(event) => patch("email", { body: event.target.value })}
          />
        </Field>
      </div>
    );
  }

  if (kind === "phone") {
    return (
      <Field label={t.fields.phone} htmlFor="phone">
        <input
          id="phone"
          type="tel"
          className={fieldClass}
          autoComplete="tel"
          placeholder={t.placeholders.phone}
          value={content.phone.number}
          onChange={(event) => patch("phone", { number: event.target.value })}
        />
      </Field>
    );
  }

  if (kind === "vcard") {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.fields.firstName} htmlFor="first-name">
          <input id="first-name" className={fieldClass} autoComplete="given-name" value={content.vcard.firstName} onChange={(event) => patch("vcard", { firstName: event.target.value })} />
        </Field>
        <Field label={t.fields.lastName} htmlFor="last-name">
          <input id="last-name" className={fieldClass} autoComplete="family-name" value={content.vcard.lastName} onChange={(event) => patch("vcard", { lastName: event.target.value })} />
        </Field>
        <Field label={t.fields.organization} htmlFor="org">
          <input id="org" className={fieldClass} autoComplete="organization" value={content.vcard.organization} onChange={(event) => patch("vcard", { organization: event.target.value })} />
        </Field>
        <Field label={t.fields.job} htmlFor="job">
          <input id="job" className={fieldClass} autoComplete="organization-title" value={content.vcard.title} onChange={(event) => patch("vcard", { title: event.target.value })} />
        </Field>
        <Field label={t.fields.phone} htmlFor="vcard-phone">
          <input id="vcard-phone" type="tel" className={fieldClass} value={content.vcard.phone} onChange={(event) => patch("vcard", { phone: event.target.value })} />
        </Field>
        <Field label={t.fields.email} htmlFor="vcard-email">
          <input id="vcard-email" type="email" className={fieldClass} value={content.vcard.email} onChange={(event) => patch("vcard", { email: event.target.value })} />
        </Field>
        <Field label={t.fields.website} htmlFor="vcard-url">
          <input id="vcard-url" className={`${fieldClass} sm:col-span-2`} value={content.vcard.website} onChange={(event) => patch("vcard", { website: event.target.value })} />
        </Field>
      </div>
    );
  }

  if (kind === "whatsapp" || kind === "sms") {
    const data = content[kind];
    return (
      <div className="grid gap-4">
        <Field label={kind === "whatsapp" ? t.fields.whatsapp : t.fields.sms} htmlFor={`${kind}-number`}>
          <input
            id={`${kind}-number`}
            type="tel"
            className={fieldClass}
            placeholder={t.placeholders.phone}
            value={data.number}
            onChange={(event) => patch(kind, { number: event.target.value })}
          />
        </Field>
        <Field label={t.fields.message} htmlFor={`${kind}-message`}>
          <textarea
            id={`${kind}-message`}
            rows={3}
            className={fieldClass}
            value={data.message}
            onChange={(event) => patch(kind, { message: event.target.value })}
          />
        </Field>
      </div>
    );
  }

  if (kind === "location") {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.fields.place} htmlFor="place">
          <input
            id="place"
            className={`${fieldClass} sm:col-span-2`}
            placeholder={t.placeholders.place}
            value={content.location.query}
            onChange={(event) => patch("location", { query: event.target.value })}
          />
        </Field>
        <Field label={t.fields.latitude} htmlFor="lat">
          <input id="lat" inputMode="decimal" className={fieldClass} value={content.location.latitude} onChange={(event) => patch("location", { latitude: event.target.value })} />
        </Field>
        <Field label={t.fields.longitude} htmlFor="lng">
          <input id="lng" inputMode="decimal" className={fieldClass} value={content.location.longitude} onChange={(event) => patch("location", { longitude: event.target.value })} />
        </Field>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={t.fields.eventTitle} htmlFor="event-title">
        <input id="event-title" className={fieldClass} value={content.event.title} onChange={(event) => patch("event", { title: event.target.value })} />
      </Field>
      <Field label={t.fields.where} htmlFor="event-where">
        <input id="event-where" className={fieldClass} value={content.event.location} onChange={(event) => patch("event", { location: event.target.value })} />
      </Field>
      <Field label={t.fields.starts} htmlFor="event-start">
        <input id="event-start" type="datetime-local" className={fieldClass} value={content.event.start} onChange={(event) => patch("event", { start: event.target.value })} />
      </Field>
      <Field label={t.fields.ends} htmlFor="event-end">
        <input id="event-end" type="datetime-local" className={fieldClass} value={content.event.end} onChange={(event) => patch("event", { end: event.target.value })} />
      </Field>
      <Field label={t.fields.details} htmlFor="event-details">
        <textarea id="event-details" rows={3} className={fieldClass} value={content.event.details} onChange={(event) => patch("event", { details: event.target.value })} />
      </Field>
    </div>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
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
  disabled = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const hexOk = /^#[0-9a-fA-F]{6}$/.test(value);
  return (
    <div className={`grid gap-1.5 ${disabled ? "opacity-40" : ""}`}>
      <label htmlFor={`${id}-hex`} className="text-sm font-medium">
        {label}
      </label>
      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 p-1.5">
        <input
          id={id}
          aria-label={label}
          type="color"
          disabled={disabled}
          value={hexOk ? value : "#000000"}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
          className="h-10 w-12 cursor-pointer rounded-lg border-0 bg-transparent disabled:cursor-not-allowed"
        />
        <input
          id={`${id}-hex`}
          value={value}
          disabled={disabled}
          spellCheck={false}
          maxLength={7}
          onChange={(event) => {
            const next = event.target.value.startsWith("#") ? event.target.value : `#${event.target.value}`;
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
        <span key={index} className="aspect-square bg-current" style={{ borderRadius: radius, opacity: index === 4 ? 0.25 : 1 }} />
      ))}
    </span>
  );
}
