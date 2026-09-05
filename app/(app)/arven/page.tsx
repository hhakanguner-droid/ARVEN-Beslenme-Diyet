"use client";

import { useEffect, useRef, useState } from "react";
import { BrandWordmark } from "@/components/layout/AppShell";

type PortionHint = { measure: string; quantity: number; size?: string; naturalLabel: string };
type SuggestedIngredient = { foodQuery: string; portionHint: PortionHint };
type MealSuggestion = {
  title: string;
  rationale: string;
  ingredients: SuggestedIngredient[];
  preparation: string[];
  uncertainty: string[];
};
type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  mealSuggestion?: MealSuggestion;
  proposedActionId?: string | null;
  proposedWaterMl?: number;
  actionStatus?: "pending" | "confirmed" | "rejected";
  uncertainty?: string[];
};

type WeeklyMetrics = {
  weekStartLocalDate: string;
  weekEndLocalDate: string;
  hasGoal: boolean;
  daysWithLoggedFood: number;
  averageWaterMl: number;
};
type WeeklyInsight = { summary: string; positives: string[]; areasForImprovement: string[]; suggestions: string[]; uncertainty: string[] };
type WeeklyInsightResponse = { metrics: WeeklyMetrics; narrative: WeeklyInsight | null; aiAvailable: boolean };

const quickStarts = [
  { icon: "🥗", label: "Öğün önerisi" },
  { icon: "⌕", label: "Yemek analizi" },
  { icon: "🍽", label: "Restoran seçimi" },
  { icon: "▤", label: "Tahlil yorumu" },
] as const;

function formatPortion(hint: PortionHint): string {
  return hint.naturalLabel;
}

export default function ArvenPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [weekly, setWeekly] = useState<WeeklyInsightResponse | null>(null);
  const [weeklyLoading, setWeeklyLoading] = useState(true);
  const threadEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/ai/weekly-insight");
        if (res.ok) setWeekly(await res.json());
      } finally {
        setWeeklyLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  async function sendMessage() {
    const trimmed = input.trim();
    if (!trimmed || sending) return;
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setInput("");
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: trimmed, history }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "ARVEN'e ulaşılamadı");
      const reply = data.reply as { reply: string; mealSuggestion?: MealSuggestion; proposedWaterAction?: { milliliters: number }; uncertainty?: string[] };
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: reply.reply,
          mealSuggestion: reply.mealSuggestion,
          proposedActionId: data.proposedActionId ?? null,
          proposedWaterMl: reply.proposedWaterAction?.milliliters,
          actionStatus: data.proposedActionId ? "pending" : undefined,
          uncertainty: reply.uncertainty,
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ARVEN'e ulaşılamadı");
    } finally {
      setSending(false);
    }
  }

  async function decideProposal(index: number, decision: "confirmed" | "rejected") {
    const message = messages[index];
    if (!message.proposedActionId) return;
    try {
      const res = await fetch("/api/ai/actions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ actionId: message.proposedActionId, decision }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "İşlem tamamlanamadı");
      setMessages((prev) => prev.map((m, i) => (i === index ? { ...m, actionStatus: decision } : m)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "İşlem tamamlanamadı");
    }
  }

  return (
    <>
      <BrandWordmark />
      <h1 className="page-title">ARVEN ile konuş</h1>
      <p className="page-subtitle">Beslenmeni sor, planını değerlendir, alternatif iste. ARVEN önerir; kayıt ve plan değişiklikleri sen onaylamadan uygulanmaz.</p>

      {!weeklyLoading && weekly && (
        <section className="card soft" aria-labelledby="weekly-insight-heading">
          <h2 id="weekly-insight-heading" className="card-title">Bu haftaya bakış</h2>
          {weekly.narrative ? (
            <>
              <p className="card-copy">{weekly.narrative.summary}</p>
              {weekly.narrative.positives.length > 0 && (
                <ul className="insight-list">{weekly.narrative.positives.map((p, i) => <li key={i}>{p}</li>)}</ul>
              )}
              {weekly.narrative.suggestions.length > 0 && (
                <ul className="insight-list">{weekly.narrative.suggestions.map((s, i) => <li key={i}>{s}</li>)}</ul>
              )}
            </>
          ) : weekly.aiAvailable ? (
            <p className="card-copy">Bu hafta için henüz bir değerlendirme oluşturulamadı.</p>
          ) : (
            <p className="card-copy">
              {weekly.metrics.daysWithLoggedFood > 0
                ? `Bu hafta ${weekly.metrics.daysWithLoggedFood} gün beslenme kaydı yaptın. Yapay zeka bağlantısı ayarlandığında burada haftalık bir değerlendirme de görebileceksin.`
                : "Bu hafta henüz beslenme kaydı yok. Yapay zeka bağlantısı ayarlandığında burada haftalık bir değerlendirme de görebileceksin."}
            </p>
          )}
        </section>
      )}

      <div className="chat-box">
        {messages.length === 0 && (
          <div className="card soft" style={{ marginTop: 0 }}>
            <h2 className="card-title">✦ ARVEN</h2>
            <p className="card-copy">Bana beslenmenle ilgili bir şey sorabilir, öğün önerisi isteyebilir ya da su içtiğini söyleyebilirsin. Sağlık konusunda tanı veya tedavi önerisi vermem.</p>
          </div>
        )}
        <div className="chat-thread">
          {messages.map((message, index) => (
            <div key={index} className={`chat-bubble-row ${message.role}`}>
              <div className={`chat-bubble ${message.role}`}>{message.content}</div>
              {message.uncertainty && message.uncertainty.length > 0 && (
                <p className="chat-uncertainty">{message.uncertainty.join(" ")}</p>
              )}
              {message.mealSuggestion && (
                <div className="chat-meal-suggestion">
                  <strong>{message.mealSuggestion.title}</strong>
                  <p className="card-copy" style={{ marginTop: 6 }}>{message.mealSuggestion.rationale}</p>
                  <ul>
                    {message.mealSuggestion.ingredients.map((ingredient, i) => (
                      <li key={i}>{ingredient.foodQuery} — {formatPortion(ingredient.portionHint)}</li>
                    ))}
                  </ul>
                </div>
              )}
              {message.proposedActionId && (
                <div className="chat-proposal">
                  <span className="card-copy">Önerilen kayıt: {message.proposedWaterMl} ml su</span>
                  {message.actionStatus === "pending" && (
                    <div className="chat-proposal-actions">
                      <button className="primary-button" type="button" onClick={() => decideProposal(index, "confirmed")}>Onayla ve kaydet</button>
                      <button className="secondary-button" type="button" onClick={() => decideProposal(index, "rejected")}>Vazgeç</button>
                    </div>
                  )}
                  {message.actionStatus === "confirmed" && <p className="status-banner">Kaydedildi.</p>}
                  {message.actionStatus === "rejected" && <p className="card-copy">Vazgeçildi.</p>}
                </div>
              )}
            </div>
          ))}
          <div ref={threadEndRef} />
        </div>
        {sending && <p className="card-copy" style={{ marginTop: 10 }}>ARVEN yazıyor…</p>}
        {error && <p className="error-banner">{error}</p>}
      </div>

      <div className="chat-composer">
        <input
          aria-label="ARVEN'e mesaj"
          placeholder="ARVEN’e bir şey sor..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
          disabled={sending}
        />
        <button className="primary-button" type="button" onClick={sendMessage} disabled={sending || !input.trim()} aria-label="Gönder">↑</button>
      </div>

      <h2 className="section-heading">ARVEN ile hızlı başla</h2>
      <div className="quick-grid">
        {quickStarts.map((item) => (
          <button
            key={item.label}
            className="quick-card"
            type="button"
            onClick={() => setInput((prev) => (prev ? prev : item.label))}
          >
            <span className="quick-icon" aria-hidden="true">{item.icon}</span>
            <strong>{item.label}</strong>
          </button>
        ))}
      </div>
    </>
  );
}
