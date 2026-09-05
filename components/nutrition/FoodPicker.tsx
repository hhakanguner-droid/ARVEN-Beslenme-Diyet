"use client";

import { useEffect, useRef, useState } from "react";

export type PickedFoodItem = {
  foodVersionId: string;
  label: string;
  selection:
    | { kind: "household"; portionVersionId: string; quantity: number }
    | { kind: "custom-grams"; grams: number };
};

type SearchFood = {
  id: string;
  name: string;
  barcode?: string | null;
  portionOptions?: { id: string; label: string; gramsPerUnit: number }[];
};

/** The native barcode-scanning Web API — only declared here since it's still missing from TS's own DOM lib types. Not every browser implements it (notably Firefox and Safari as of this writing). */
declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats?: string[] }) => {
      detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
    };
  }
}

const BARCODE_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"];

/**
 * Verified-catalog search + portion picker, shared by "Bugün" (quick add) and "Planım" (plan slots).
 * Deliberately calculation-free on the client: it only collects `foodVersionId` + the portion
 * selection the user picked (a household portion, or an exact gram amount for foods that don't
 * have one — e.g. a food just imported from Open Food Facts) — every gram/kcal number is derived
 * server-side, behind `V1MutationService`, exactly like every other mutation in this app.
 *
 * Also offers barcode lookup: typing a barcode in by hand, or scanning one with the device camera
 * via the native `BarcodeDetector` API (falls back to a plain message on browsers that lack it —
 * manual entry always works). Either path hits `/api/foods/barcode`, which transparently imports a
 * new Open Food Facts product into the shared catalog on a local miss.
 */
export function FoodPicker({
  onAdd,
  addLabel = "Ekle",
  initialQuery,
  initialBarcode,
}: {
  onAdd: (item: PickedFoodItem) => void;
  addLabel?: string;
  /** Prefills the search box — e.g. from a vision photo estimate's `foodQuery`. Re-applies whenever it changes. */
  initialQuery?: string;
  /** Prefills the barcode field and triggers a lookup — e.g. from a vision photo's `detectedBarcode`. Re-applies whenever it changes. */
  initialBarcode?: string;
}) {
  const [query, setQuery] = useState(initialQuery ?? "");
  const [results, setResults] = useState<SearchFood[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedFood, setSelectedFood] = useState<SearchFood | null>(null);
  const [portionId, setPortionId] = useState<string>("");
  const [quantity, setQuantity] = useState<string>("1");
  const [grams, setGrams] = useState<string>("100");

  const [barcodeInput, setBarcodeInput] = useState("");
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const [barcodeStatus, setBarcodeStatus] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanUnsupported, setScanUnsupported] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) { setResults([]); return; }
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(() => {
      fetch(`/api/foods/search?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal })
        .then((res) => res.json())
        .then((data: { foods?: SearchFood[] }) => setResults(data.foods ?? []))
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);

  // Stop the camera and any pending detection loop if the component unmounts mid-scan.
  useEffect(() => stopScanning, []);

  // Re-applies whenever the parent passes a new prefill value (e.g. the next item in a photo estimate's list).
  useEffect(() => {
    if (initialQuery !== undefined) setQuery(initialQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  useEffect(() => {
    if (initialBarcode) { setBarcodeInput(initialBarcode); lookupBarcode(initialBarcode); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialBarcode]);

  function pickFood(food: SearchFood) {
    setSelectedFood(food);
    setPortionId(food.portionOptions?.[0]?.id ?? "");
    setQuantity("1");
    setGrams("100");
    setBarcodeStatus(null);
  }

  function handleAdd() {
    if (!selectedFood) return;
    const hasPortions = (selectedFood.portionOptions?.length ?? 0) > 0;
    if (hasPortions) {
      if (!portionId) return;
      const parsedQuantity = Number(quantity.replace(",", "."));
      if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) return;
      const portion = selectedFood.portionOptions?.find((p) => p.id === portionId);
      onAdd({
        foodVersionId: selectedFood.id,
        label: `${selectedFood.name} — ${parsedQuantity} × ${portion?.label ?? ""}`,
        selection: { kind: "household", portionVersionId: portionId, quantity: parsedQuantity },
      });
    } else {
      const parsedGrams = Number(grams.replace(",", "."));
      if (!Number.isFinite(parsedGrams) || parsedGrams <= 0) return;
      onAdd({
        foodVersionId: selectedFood.id,
        label: `${selectedFood.name} — ${parsedGrams} g`,
        selection: { kind: "custom-grams", grams: parsedGrams },
      });
    }
    setSelectedFood(null);
    setQuery("");
    setResults([]);
    setBarcodeInput("");
    setBarcodeStatus(null);
  }

  async function lookupBarcode(code: string) {
    const trimmed = code.trim();
    if (!trimmed) return;
    setBarcodeLoading(true);
    setBarcodeStatus(null);
    try {
      const res = await fetch(`/api/foods/barcode?code=${encodeURIComponent(trimmed)}`);
      const data: { food?: SearchFood | null } = await res.json();
      if (data.food) {
        stopScanning();
        pickFood(data.food);
      } else {
        setBarcodeStatus("Bu barkoda ait bir yemek bulunamadı.");
      }
    } catch {
      setBarcodeStatus("Barkod aranırken bir sorun oluştu.");
    } finally {
      setBarcodeLoading(false);
    }
  }

  function stopScanning() {
    if (scanTimerRef.current) { clearInterval(scanTimerRef.current); scanTimerRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach((track) => track.stop()); streamRef.current = null; }
    setScanning(false);
  }

  async function startScanning() {
    const Detector = typeof window !== "undefined" ? window.BarcodeDetector : undefined;
    if (!Detector) { setScanUnsupported(true); return; }
    setBarcodeStatus(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      setScanning(true);
      // The <video> only mounts once `scanning` becomes true; attach the stream on the next tick.
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 0);
      const detector = new Detector({ formats: BARCODE_FORMATS });
      scanTimerRef.current = setInterval(() => {
        const video = videoRef.current;
        if (!video) return;
        detector.detect(video).then((codes) => {
          const value = codes[0]?.rawValue;
          if (!value) return;
          stopScanning();
          setBarcodeInput(value);
          lookupBarcode(value);
        }).catch(() => {
          // A frame mid-decode occasionally throws; the loop just tries again on the next tick.
        });
      }, 400);
    } catch {
      setBarcodeStatus("Kameraya erişilemedi. Barkod numarasını elle girebilirsiniz.");
      stopScanning();
    }
  }

  return (
    <div className="food-picker">
      <input
        type="text"
        inputMode="search"
        placeholder="Yemek ara (ör. yoğurt, elma)"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="food-picker-input"
      />
      {loading && <p className="card-copy">Aranıyor…</p>}
      {!selectedFood && results.length > 0 && (
        <ul className="food-picker-results">
          {results.map((food) => (
            <li key={food.id}>
              <button type="button" className="food-picker-result" onClick={() => pickFood(food)}>
                {food.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {!selectedFood && !loading && query.trim() && results.length === 0 && (
        <p className="card-copy">Sonuç bulunamadı.</p>
      )}

      {!selectedFood && (
        <div className="food-picker-barcode">
          <p className="card-copy">Barkod ile ara</p>
          <div className="food-picker-row">
            <input
              type="text"
              inputMode="numeric"
              placeholder="Barkod numarası"
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              className="food-picker-input"
            />
            <button type="button" className="secondary-button" disabled={barcodeLoading} onClick={() => lookupBarcode(barcodeInput)}>
              {barcodeLoading ? "Aranıyor…" : "Bul"}
            </button>
          </div>
          {!scanning && (
            <button type="button" className="secondary-button" onClick={startScanning}>
              Kamera ile Tara
            </button>
          )}
          {scanning && (
            <div className="food-picker-scanner">
              {/* Muted+autoplay avoids browsers blocking playback; the detection loop reads frames directly, no controls needed. */}
              <video ref={videoRef} muted autoPlay playsInline className="food-picker-scanner-video" />
              <button type="button" className="secondary-button" onClick={stopScanning}>Taramayı Durdur</button>
            </div>
          )}
          {scanUnsupported && (
            <p className="card-copy">Bu tarayıcı kamera ile barkod taramayı desteklemiyor. Barkod numarasını elle girip &quot;Bul&quot; ile arayabilirsiniz.</p>
          )}
          {barcodeStatus && <p className="card-copy">{barcodeStatus}</p>}
        </div>
      )}

      {selectedFood && (
        <div className="food-picker-selection">
          <strong>{selectedFood.name}</strong>
          {(selectedFood.portionOptions?.length ?? 0) > 0 ? (
            <div className="food-picker-row">
              <select value={portionId} onChange={(e) => setPortionId(e.target.value)}>
                {(selectedFood.portionOptions ?? []).map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
              <input
                type="number"
                min="0.01"
                step="0.01"
                inputMode="decimal"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="food-picker-quantity"
                aria-label="Miktar"
              />
            </div>
          ) : (
            <div className="food-picker-row">
              <input
                type="number"
                min="0.1"
                step="0.1"
                inputMode="decimal"
                value={grams}
                onChange={(e) => setGrams(e.target.value)}
                className="food-picker-quantity"
                aria-label="Gram"
              />
              <span className="card-copy">gram</span>
            </div>
          )}
          <div className="food-picker-row">
            <button type="button" className="secondary-button" onClick={() => setSelectedFood(null)}>Vazgeç</button>
            <button type="button" className="primary-button" onClick={handleAdd}>{addLabel}</button>
          </div>
        </div>
      )}
    </div>
  );
}
