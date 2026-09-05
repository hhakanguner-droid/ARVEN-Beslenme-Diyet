import { resolveRouteContext, routeErrorResponse } from "@/lib/api/route-context";
import { buildAiContext, renderSystemPrompt } from "@/lib/ai/context-engine";
import type { ArvenChatReply } from "@/lib/ai/contracts";
import { AiProviderError, getOptionalAiProvider, type ArvenChatTurn } from "@/lib/ai/provider";

const OFFLINE_REPLY: ArvenChatReply = {
  schemaVersion: "ArvenChatReplyV1",
  reply:
    "Şu anda ARVEN'in yapay zeka bağlantısı henüz ayarlanmadığı için sohbet özelliği pasif durumda. " +
    "Bu arada besinlerini ve suyunu elle kaydetmeye devam edebilirsin.",
  uncertainty: [],
};

const OFFLINE_ERROR_REPLY: ArvenChatReply = {
  schemaVersion: "ArvenChatReplyV1",
  reply: "Şu anda ARVEN'e ulaşamadım, biraz sonra tekrar dener misin?",
  uncertainty: [],
};

type ChatRequestBody = { message?: unknown; history?: unknown };

function sanitizeHistory(raw: unknown): ArvenChatTurn[] {
  if (!Array.isArray(raw)) return [];
  const turns: ArvenChatTurn[] = [];
  for (const entry of raw.slice(-12)) {
    if (!entry || typeof entry !== "object") continue;
    const role = (entry as Record<string, unknown>).role;
    const content = (entry as Record<string, unknown>).content;
    if ((role === "user" || role === "assistant") && typeof content === "string" && content.trim()) {
      turns.push({ role, content: content.trim() });
    }
  }
  return turns;
}

/**
 * ARVEN chat turn: builds deterministic context, calls the OpenAI provider (when configured),
 * and — per Phase 4's deliberately scoped "proposed/confirmed AI actions" — persists any
 * proposed water-log action and any suggested memory facts. Meal suggestions in the reply stay
 * informational-only; the user acts on them manually through the existing food search/log UI.
 */
export async function POST(request: Request) {
  try {
    const context = await resolveRouteContext(request);
    const body = (await request.json().catch(() => ({}))) as ChatRequestBody;
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message) return Response.json({ error: "message is required" }, { status: 400 });

    const provider = getOptionalAiProvider();
    if (!provider) {
      return Response.json({ reply: OFFLINE_REPLY, aiAvailable: false, proposedActionId: null });
    }

    let reply: ArvenChatReply;
    try {
      const aiContext = await buildAiContext(context);
      reply = await provider.generateChatReply({
        systemPrompt: renderSystemPrompt(aiContext),
        history: sanitizeHistory(body.history),
        userMessage: message,
      });
    } catch (error) {
      if (error instanceof AiProviderError) {
        return Response.json({ reply: OFFLINE_ERROR_REPLY, aiAvailable: true, proposedActionId: null, error: error.code });
      }
      throw error;
    }

    let proposedActionId: string | null = null;
    if (reply.proposedWaterAction) {
      const proposal = await context.service.createAiProposal(
        "water-log",
        { schemaVersion: "WaterLogActionV1", occurredAt: new Date().toISOString(), milliliters: reply.proposedWaterAction.milliliters },
        `chat-water-${context.subject}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      );
      proposedActionId = proposal.id;
    }

    if (reply.memoryUpdates && reply.memoryUpdates.length > 0) {
      await context.service.recordMemoryFacts({
        schemaVersion: "MemoryFactRecordV1",
        facts: reply.memoryUpdates.map((update) => ({
          factText: update.factText,
          confidence: update.confidence,
          provenance: update.provenance,
        })),
      });
    }

    return Response.json({ reply, aiAvailable: true, proposedActionId });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
