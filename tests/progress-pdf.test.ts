import assert from "node:assert/strict";
import test from "node:test";
import { renderSimplePdf } from "@/lib/progress/pdf";

test("renderSimplePdf produces a well-formed minimal PDF with a valid header, xref, and trailer", () => {
  const bytes = renderSimplePdf("ARVEN Test Raporu", [{ text: "Enerji: 2000 kcal" }, { text: "Kilo: 78.5 kg", bold: true }]);
  const text = Buffer.from(bytes).toString("latin1");
  assert.ok(text.startsWith("%PDF-1.4\n"), "must start with a PDF header");
  assert.ok(text.trimEnd().endsWith("%%EOF"), "must end with the PDF end-of-file marker");
  assert.match(text, /\/Type \/Catalog/);
  assert.match(text, /\/Type \/Page\b/);
  assert.match(text, /\/BaseFont \/Helvetica\b/);
  assert.match(text, /xref\n0 7\n/);
  assert.match(text, /trailer\n<< \/Size 7 \/Root 1 0 R >>/);
});

test("renderSimplePdf transliterates Turkish letters outside WinAnsiEncoding but keeps native Latin-1 Turkish letters untouched", () => {
  const bytes = renderSimplePdf("Başlık ıĞşÜöç", [{ text: "İştah" }]);
  const text = Buffer.from(bytes).toString("latin1");
  assert.ok(!text.includes("ş") && !text.includes("ğ") && !text.includes("ı") && !text.includes("İ"), "ş/ğ/ı/İ must be transliterated");
  assert.ok(text.includes("Baslik iGsUcoc".replace("Uc", "Üö").replace("oc","ç")), "transliteration must only replace ş/ğ/ı/İ, leaving native Latin-1 Turkish letters (Ü, ö, ç) untouched");
});

test("renderSimplePdf escapes PDF-special characters in text so the content stream stays well-formed", () => {
  const bytes = renderSimplePdf("Rapor (v1)", [{ text: "Not: %100 uyum \\ test" }]);
  const text = Buffer.from(bytes).toString("latin1");
  assert.match(text, /\\\(v1\\\)/, "parentheses in the title must be escaped");
  assert.match(text, /test\) Tj/, "the line must still terminate its Tj operator correctly after escaping");
});
