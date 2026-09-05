"use client";

import { useEffect, useState } from "react";
import { BrandWordmark } from "@/components/layout/AppShell";
import { EmptyState } from "@/components/states/EmptyState";

type MemoryFact = { id: string; factText: string; provenance: "user-stated" | "ai-inferred"; confidence: "high" | "medium" | "low"; createdAt: string };

const CONFIDENCE_LABEL: Record<MemoryFact["confidence"], string> = { high: "yüksek", medium: "orta", low: "düşük" };
const PROVENANCE_LABEL: Record<MemoryFact["provenance"], string> = { "user-stated": "senin belirttiğin", "ai-inferred": "ARVEN'in çıkarımı" };

function formatDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" }); }
  catch { return ""; }
}

export default function ArvenHafizaPage() {
  const [facts, setFacts] = useState<MemoryFact[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function refresh() {
    try {
      const res = await fetch("/api/ai/memory");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Hafıza bilgileri alınamadı");
      setFacts(data.facts);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Hafıza bilgileri alınamadı");
    }
  }

  useEffect(() => { refresh(); }, []);

  async function deleteFact(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch("/api/ai/memory", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Silinemedi");
      setFacts(data.facts);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Silinemedi");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <BrandWordmark />
      <h1 className="page-title">ARVEN hafızası</h1>
      <p className="page-subtitle">
        ARVEN, sohbetlerinizden seni daha iyi tanımak için küçük notlar tutar. İstediğin herhangi bir notu buradan silebilirsin.
      </p>

      {error && <p className="error-banner">{error}</p>}

      {facts === null && !error && <p className="card-copy" style={{ marginTop: 18 }}>Yükleniyor…</p>}

      {facts !== null && facts.length === 0 && (
        <EmptyState
          icon="🧠"
          title="Henüz bir not yok"
          description="ARVEN ile konuştukça, seninle ilgili hatırlamaya değer bulduğu küçük notları burada listeleyecek."
        />
      )}

      {facts !== null && facts.length > 0 && (
        <div className="menu-list">
          {facts.map((fact) => (
            <div key={fact.id} className="memory-fact-row">
              <div>
                <span className="memory-fact-text">{fact.factText}</span>
                <span className="memory-fact-meta">
                  {PROVENANCE_LABEL[fact.provenance]} · güven: {CONFIDENCE_LABEL[fact.confidence]} · {formatDate(fact.createdAt)}
                </span>
              </div>
              <button
                type="button"
                className="link-button"
                disabled={deletingId === fact.id}
                onClick={() => deleteFact(fact.id)}
              >
                {deletingId === fact.id ? "Siliniyor…" : "Sil"}
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
