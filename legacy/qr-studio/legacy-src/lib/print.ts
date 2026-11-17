import { jsPDF } from "jspdf";

export type PrintFormat = "a6" | "a4";

const PAGE = {
  a6: { width: 105, height: 148 },
  a4: { width: 210, height: 297 },
} as const;

export async function downloadPrintPdf(options: {
  format: PrintFormat;
  png: Blob;
  caption: string;
  foreground: string;
}): Promise<void> {
  const page = PAGE[options.format];
  const pdf = new jsPDF({ unit: "mm", format: options.format, orientation: "portrait" });
  const dataUrl = await blobToDataUrl(options.png);
  const side = Math.min(page.width, page.height) * (options.format === "a6" ? 0.72 : 0.58);
  const x = (page.width - side) / 2;
  const y = (page.height - side) / 2 - 8;
  pdf.setFillColor(255, 255, 255);
  pdf.rect(0, 0, page.width, page.height, "F");
  pdf.addImage(dataUrl, "PNG", x, y, side, side);
  if (options.caption.trim()) {
    pdf.setTextColor(options.foreground);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(options.format === "a6" ? 16 : 28);
    pdf.text(options.caption.trim(), page.width / 2, y + side + (options.format === "a6" ? 12 : 18), {
      align: "center",
      maxWidth: page.width - 16,
    });
  }
  pdf.save(`avenqio-qr-${options.format}.pdf`);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
