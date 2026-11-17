function channel(hex: string, index: number): number {
  const value = parseInt(hex.slice(index, index + 2), 16) / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

export function contrastRatio(foreground: string, background: string): number {
  const normalize = (hex: string) => {
    const raw = hex.replace("#", "").trim();
    if (raw.length === 3) {
      return raw
        .split("")
        .map((char) => char + char)
        .join("");
    }
    return raw.slice(0, 6);
  };
  const lum = (hex: string) => {
    const full = normalize(hex);
    if (!/^[0-9a-fA-F]{6}$/.test(full)) return 0;
    return 0.2126 * channel(full, 0) + 0.7152 * channel(full, 2) + 0.0722 * channel(full, 4);
  };
  const lighter = Math.max(lum(foreground), lum(background));
  const darker = Math.min(lum(foreground), lum(background));
  return (lighter + 0.05) / (darker + 0.05);
}
