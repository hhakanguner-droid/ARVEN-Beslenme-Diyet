import type { RouteContext } from "@/lib/api/route-context";
import { V1NutritionReadRepository } from "@/lib/persistence/read-repositories";
import type { StoredMemoryFact, StoredProfile, StoredGoalVersion } from "@/lib/persistence/v1-boundary";
import { remainingTargets } from "@/lib/nutrition/calculations";
import type { AllergenSafetyExclusion, DietarySafetyExclusion } from "@/lib/health-safety/policy";

/**
 * Deterministic snapshot the chat route hands to the AI provider as grounding. Every field here
 * is computed by ARVEN's own deterministic services (never by the model itself) — this is the
 * concrete instance of the "numeric truth comes from deterministic services" rule from
 * docs/ARCHITECTURE.md as applied to Phase 4's chat feature.
 */
export type ArvenAiContext = {
  todayLocalDate: string;
  profile: { displayName: string | null; activityLevel: StoredProfile["activityLevel"] };
  hasGoal: boolean;
  remainingToday: ReturnType<typeof remainingTargets> | null;
  allergenLabels: string[];
  dietaryExclusionLabels: string[];
  recentMemoryFacts: StoredMemoryFact[];
};

/** Assembles the deterministic context a chat turn is grounded in. Never invokes the AI provider itself. */
export async function buildAiContext(context: RouteContext): Promise<ArvenAiContext> {
  const { subject, runner, todayLocalDate, service } = context;
  const [snapshot, memoryFacts, { profile, goal, allergens, dietaryExclusions }] = await Promise.all([
    new V1NutritionReadRepository(runner).getDailySnapshot(subject, todayLocalDate),
    service.listMemoryFacts(),
    runner.transaction(async (tx) => {
      const [profile, goal, allergens, dietaryExclusions] = await Promise.all([
        tx.getProfile(subject),
        tx.getCurrentGoalVersion(subject),
        tx.getActiveAllergenExclusions(subject),
        tx.getActiveDietaryExclusions(subject),
      ]);
      return { profile, goal, allergens, dietaryExclusions };
    }),
  ]);

  const remainingToday = snapshot.targets
    ? remainingTargets(snapshot.targets, snapshot.consumed, snapshot.waterMl, snapshot.consumptionCoverage)
    : null;

  return {
    todayLocalDate,
    profile: { displayName: profile?.displayName ?? null, activityLevel: profile?.activityLevel ?? null },
    hasGoal: goal !== null,
    remainingToday,
    allergenLabels: allergens.map((a: AllergenSafetyExclusion) => a.label),
    dietaryExclusionLabels: dietaryExclusions.map((d: DietarySafetyExclusion) => d.label),
    recentMemoryFacts: memoryFacts.slice(0, 10),
  };
}

function formatGoalStatus(context: ArvenAiContext): string {
  if (!context.hasGoal) return "Kullanıcının henüz belirlenmiş bir günlük hedefi yok.";
  if (!context.remainingToday) return "Bugünkü hedef durumu hesaplanamadı.";
  return "Bugün için kalan hedef bilgisi uygulama tarafından ayrıca hesaplanıp gösteriliyor; sen bu sayıları kendi başına tekrar üretme veya tahmin etme.";
}

/**
 * Turns the deterministic context into a compact Turkish system prompt string for the OpenAI
 * provider. Deliberately never embeds a specific number from `remainingToday` — the prompt only
 * states whether numeric context exists, not what the numbers are, so the model has no numeric
 * nutrition data to echo back or misremember. The app itself renders the exact figures elsewhere.
 */
export function renderSystemPrompt(context: ArvenAiContext): string {
  const lines: string[] = [
    "Sen ARVEN, bir beslenme ve diyet takip uygulamasının içindeki yapay zeka asistanısın.",
    "Kullanıcıyla her zaman Türkçe, sıcak ve destekleyici bir dille konuş.",
    "Asla tıbbi teşhis koyma, tedavi önerme veya bir hastalığı olduğunu ima etme; sadece genel, tıbbi olmayan beslenme desteği ver.",
    "Kesin sayısal beslenme, kalori, kilo veya hedef uyum değerlerini ASLA kendin üretme veya söyleme — bu sayılar yalnızca uygulamanın kendi hesaplamalarından gelir ve ayrıca ekranda gösterilir.",
    formatGoalStatus(context),
  ];
  if (context.allergenLabels.length > 0) {
    lines.push(`Kullanıcının alerjisi olan besinler: ${context.allergenLabels.join(", ")}. Önerilerinde bunlardan kesinlikle kaçın.`);
  }
  if (context.dietaryExclusionLabels.length > 0) {
    lines.push(`Kullanıcının beslenme tercihi gereği kaçındığı besinler: ${context.dietaryExclusionLabels.join(", ")}.`);
  }
  if (context.recentMemoryFacts.length > 0) {
    lines.push("Kullanıcı hakkında hatırladığın notlar:");
    for (const fact of context.recentMemoryFacts) lines.push(`- ${fact.factText}`);
  }
  lines.push(
    "Kullanıcı su içtiğini belirtirse ve net bir miktar verirse, proposedWaterAction alanıyla bunu öner; " +
      "uygulama kullanıcıya onaylatıp kaydedecek, sen doğrudan kaydetme.",
  );
  lines.push(
    "Kullanıcı hakkında kalıcı olarak hatırlanmaya değer, kısa ve somut bir bilgi öğrenirsen memoryUpdates alanıyla öner; " +
      "aşırıya kaçma, günde birkaç taneyi geçme.",
  );
  return lines.join("\n");
}
