/**
 * Minimal, dependency-free PDF writer for "Gelişim" report exports (Faz 8). Deliberately does not
 * pull in a third-party PDF library: this repository ships to a Cloudflare Worker (see
 * `custom-worker.ts`), and a full PDF engine is unnecessary weight for what is, structurally, a
 * single page of plain text lines built from data `lib/progress/reports.ts` already computed
 * deterministically — no charts, no embedded images, no layout engine required.
 *
 * Uses only the standard (non-embedded) Helvetica base-14 font, which the PDF spec guarantees every
 * conforming reader already has, so no font file needs to travel with the document. That font's
 * encoding (WinAnsiEncoding, effectively Latin-1) does not contain the Turkish letters ş/Ş/ğ/Ğ/ı/İ,
 * so `sanitizeForPdfText` transliterates just those five letters to their closest ASCII look-alike
 * before layout; every other Turkish letter (ç, ö, ü and their capitals) is native Latin-1 and
 * renders correctly untouched. This is a known, deliberate limitation — not a bug — of staying
 * dependency-free; embedding a real Turkish-covering font is future work if this ever matters.
 */

const PAGE_WIDTH = 595; // A4 at 72dpi, in points
const PAGE_HEIGHT = 842;
const MARGIN = 56;
const LINE_HEIGHT = 16;
const DEFAULT_FONT_SIZE = 11;
const TITLE_FONT_SIZE = 16;

const TURKISH_TO_ASCII: Record<string, string> = { ş: "s", Ş: "S", ğ: "g", Ğ: "G", ı: "i", İ: "I" };

function sanitizeForPdfText(value: string): string {
  return value.replace(/[şŞğĞıİ]/g, (ch) => TURKISH_TO_ASCII[ch] ?? ch);
}

function escapePdfString(value: string): string {
  return sanitizeForPdfText(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/**
 * PDF text strings and the surrounding content-stream syntax are single-byte data (WinAnsiEncoding,
 * i.e. Latin-1) — `TextEncoder` would wrongly re-encode a native Latin-1 Turkish letter (ç/ö/ü and
 * capitals, all ≤ U+00FF) as multi-byte UTF-8, corrupting it. Every character this module ever
 * writes is already ≤ U+00FF (ASCII PDF syntax, or `sanitizeForPdfText`'s output), so a direct
 * code-unit-to-byte mapping is both correct and simpler than a real encoder.
 */
function latin1Encode(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i++) bytes[i] = value.charCodeAt(i) & 0xff;
  return bytes;
}

export type PdfTextLine = { text: string; bold?: boolean; sizePt?: number };

/**
 * Renders a title plus a flat list of lines into one single-page A4 PDF and returns its raw bytes.
 * Overflow lines are simply dropped rather than adding multi-page layout: every caller in this app
 * produces a short, bounded line list (a handful of metrics), so a second page is never needed.
 */
export function renderSimplePdf(title: string, lines: PdfTextLine[]): Uint8Array {
  const contentParts: string[] = [];
  let y = PAGE_HEIGHT - MARGIN;
  contentParts.push(`BT /F2 ${TITLE_FONT_SIZE} Tf ${MARGIN} ${y} Td (${escapePdfString(title)}) Tj ET`);
  y -= LINE_HEIGHT * 2;
  for (const line of lines) {
    if (y < MARGIN) break;
    const font = line.bold ? "/F2" : "/F1";
    const size = line.sizePt ?? DEFAULT_FONT_SIZE;
    contentParts.push(`BT ${font} ${size} Tf ${MARGIN} ${y} Td (${escapePdfString(line.text)}) Tj ET`);
    y -= LINE_HEIGHT;
  }
  const content = contentParts.join("\n");
  const contentBytes = latin1Encode(content);

  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    `<< /Length ${contentBytes.length} >>\nstream\n${content}\nendstream`,
  ];

  const chunks: Uint8Array[] = [];
  const offsets: number[] = [0];
  let cursor = 0;
  function push(text: string): void {
    const bytes = latin1Encode(text);
    chunks.push(bytes);
    cursor += bytes.length;
  }
  push("%PDF-1.4\n");
  for (let i = 0; i < objects.length; i++) {
    offsets.push(cursor);
    push(`${i + 1} 0 obj\n${objects[i]}\nendobj\n`);
  }
  const xrefOffset = cursor;
  const objectCount = objects.length + 1;
  push(`xref\n0 ${objectCount}\n0000000000 65535 f \n`);
  for (let i = 1; i < offsets.length; i++) push(`${offsets[i].toString().padStart(10, "0")} 00000 n \n`);
  push(`trailer\n<< /Size ${objectCount} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(total);
  let position = 0;
  for (const chunk of chunks) { result.set(chunk, position); position += chunk.length; }
  return result;
}
