import { BrandMark } from "./components/BrandMark";
import { QrStudio } from "./components/QrStudio";
import { useLocale, type Locale } from "./i18n";

export default function App() {
  const { t, locale, setLocale } = useLocale();
  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-6 sm:px-6 sm:py-8">
      <header className="rise flex flex-wrap items-center justify-between gap-4 pb-8">
        <a href="#create" className="group flex items-center gap-3">
          <BrandMark />
          <span>
            <span className="block text-sm font-semibold tracking-[0.22em] text-white">AVENQIO</span>
            <span className="block text-xs text-mist">{t.slogan}</span>
          </span>
        </a>
        <div className="flex items-center gap-2">
          <div className="rounded-full border border-white/10 p-1 text-xs" role="group" aria-label={t.language}>
            {(["it", "en"] as Locale[]).map((code) => (
              <button
                key={code}
                type="button"
                aria-pressed={locale === code}
                className={`rounded-full px-2.5 py-1 font-medium uppercase ${
                  locale === code ? "bg-violet-500 text-white" : "text-mist"
                }`}
                onClick={() => setLocale(code)}
              >
                {code}
              </button>
            ))}
          </div>
          <p className="rounded-full border border-violet-300/20 bg-violet-500/10 px-3 py-1 text-xs font-medium tracking-wide text-lilac">
            AVENQIO QR
          </p>
        </div>
      </header>

      <main id="create" className="flex-1">
        <div className="rise mb-8 max-w-2xl">
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">{t.title}</h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-mist sm:text-lg">{t.intro}</p>
        </div>
        <QrStudio />
      </main>

      <footer className="mt-12 flex flex-col gap-3 border-t border-white/10 pt-6 text-sm text-mist sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p>AVENQIO QR · {t.slogan}</p>
          <p className="mt-1">{t.footerNote}</p>
        </div>
        <a
          className="text-lilac underline-offset-4 hover:underline"
          href="https://discord.gg/XPvpVG38BD"
          rel="noreferrer"
        >
          Discord
        </a>
      </footer>
    </div>
  );
}
