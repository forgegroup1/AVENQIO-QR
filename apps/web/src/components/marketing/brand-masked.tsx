export function BrandMasked({ size = 30 }: { size?: number }) {
  return (
    <span
      className="relative inline-flex items-center justify-center overflow-hidden rounded-[9px] border border-white/10 bg-bg-deep"
      style={{ width: size, height: size }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/avenqio-logo.png" alt="Avenqio" className="h-full w-full object-contain p-[3px]" />
    </span>
  );
}
