import {
  ARVEN_EXPORT_FORMAT,
  EXPORT_SECTIONS,
  type ExportManifest,
} from "@/lib/portability/types";
import type {
  AuthenticatedUserContext,
  StoredBodyMeasurement,
  StoredCustomFoodVersion,
  StoredGoalVersion,
  StoredMemoryFact,
  StoredNutritionEvent,
  StoredProfile,
  StoredRecipe,
  V1TransactionRunner,
} from "@/lib/persistence/v1-boundary";

/** One privately-stored file referenced by this export — bytes are never included, only the addressing metadata (see `docs/PORTABILITY.md`'s "Private media manifest" section). */
export type MediaManifestEntry = {
  id: string;
  kind: "meal-photo" | "menu-photo" | "product-photo" | "lab-document" | "body-photo" | "progress-report";
  mimeType: string;
  byteSize: number;
  storageKey: string;
  createdAt: string;
};

export type UserExportPayload = {
  manifest: ExportManifest;
  profile: StoredProfile | null;
  /** Only the currently-selected goal — this app has no product concept of "goal history" the user would want restored (see `docs/ROADMAP.md`'s Phase 2/8 entries). */
  goals: StoredGoalVersion | null;
  preferences: { timezone: string; nutritionDayStartMinutes: number };
  mealLog: StoredNutritionEvent[];
  waterLog: StoredNutritionEvent[];
  measurements: StoredBodyMeasurement[];
  recipes: StoredRecipe[];
  customFoods: StoredCustomFoodVersion[];
  aiMemory: StoredMemoryFact[];
  mediaManifest: MediaManifestEntry[];
};

/**
 * Assembles one authenticated subject's full `ArvenNutritionExportV1` backup (`docs/PORTABILITY.md`).
 * Every read here is already scoped to `subject` by the underlying `V1Transaction` methods — this
 * function never accepts or trusts an externally-supplied owner id, matching the app's ownership
 * model everywhere else. Media bytes themselves are never touched; only the small metadata rows
 * that address them in `lib/media/storage.ts` are included, under `mediaManifest`.
 */
export async function buildUserExport(
  runner: V1TransactionRunner,
  subject: string,
  userContext: AuthenticatedUserContext,
  locale: string,
  now: Date,
): Promise<UserExportPayload> {
  const {
    profile, goal, events, measurements, recipes, customFoods, memory,
    photos, labDocuments, bodyPhotos, reportExports,
  } = await runner.transaction(async (tx) => ({
    profile: await tx.getProfile(subject),
    goal: await tx.getCurrentGoalVersion(subject),
    events: await tx.listNutritionEvents(subject),
    measurements: await tx.listBodyMeasurements(subject),
    recipes: await tx.listRecipes(subject),
    customFoods: await tx.listCustomFoodVersions(subject),
    memory: await tx.listMemoryFacts(subject),
    photos: await tx.listPhotoAssets(subject),
    labDocuments: await tx.listLabDocuments(subject),
    bodyPhotos: await tx.listBodyPhotoSets(subject),
    reportExports: await tx.listProgressReportExports(subject),
  }));

  const mealLog = events.filter((event) => event.eventType === "meal-log");
  const waterLog = events.filter((event) => event.eventType === "water-log");
  const mediaManifest: MediaManifestEntry[] = [
    ...photos.map((p): MediaManifestEntry => ({ id: p.id, kind: p.kind, mimeType: p.mimeType, byteSize: p.byteSize, storageKey: p.storageKey, createdAt: p.createdAt })),
    ...labDocuments.map((d): MediaManifestEntry => ({ id: d.id, kind: "lab-document", mimeType: d.mimeType, byteSize: d.byteSize, storageKey: d.storageKey, createdAt: d.createdAt })),
    ...bodyPhotos.map((p): MediaManifestEntry => ({ id: p.id, kind: "body-photo", mimeType: p.mimeType, byteSize: p.byteSize, storageKey: p.storageKey, createdAt: p.createdAt })),
    ...reportExports.map((r): MediaManifestEntry => ({ id: r.id, kind: "progress-report", mimeType: r.mimeType, byteSize: r.byteSize, storageKey: r.storageKey, createdAt: r.createdAt })),
  ];

  const manifest: ExportManifest = {
    format: ARVEN_EXPORT_FORMAT,
    exportedAt: now.toISOString(),
    locale,
    timezone: userContext.timezone,
    sections: EXPORT_SECTIONS,
    recordCounts: {
      profile: profile ? 1 : 0,
      goals: goal ? 1 : 0,
      preferences: 1,
      "meal-log": mealLog.length,
      "water-log": waterLog.length,
      measurements: measurements.length,
      recipes: recipes.length,
      "custom-foods": customFoods.length,
      "ai-memory": memory.length,
      "media-manifest": mediaManifest.length,
    },
  };

  return {
    manifest,
    profile,
    goals: goal,
    preferences: { timezone: userContext.timezone, nutritionDayStartMinutes: userContext.nutritionDayStartMinutes },
    mealLog,
    waterLog,
    measurements,
    recipes,
    customFoods,
    aiMemory: memory,
    mediaManifest,
  };
}
