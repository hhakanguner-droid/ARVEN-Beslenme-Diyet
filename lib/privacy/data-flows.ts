export type DataCategory =
  | "food-search-term"
  | "barcode"
  | "meal-text"
  | "meal-photo"
  | "menu-photo"
  | "lab-file"
  | "app-language"
  | "ai-model-name"
  | "crash-diagnostics";

export type DataFlowTrigger =
  | "food-search"
  | "barcode-lookup"
  | "ai-meal-assistance"
  | "ai-menu-analysis"
  | "lab-extraction"
  | "diagnostics";

export type ConsentMode = "required-for-feature" | "explicit-opt-in";

export type ExternalDataFlow = {
  id: string;
  destinationLabel: string;
  trigger: DataFlowTrigger;
  categories: readonly DataCategory[];
  consentMode: ConsentMode;
  /** Human-readable explanation shown in Privacy / Data Flows. */
  purpose: string;
  /** Optional stable policy/docs link; credentials never belong here. */
  policyUrl?: string;
};

/**
 * Product-level registry. Provider adapters must declare their data flow here
 * before a user-facing feature is enabled. This list is intentionally data-only
 * so the Privacy screen can render the exact same truth the server validates.
 */
export const EXTERNAL_DATA_FLOWS: readonly ExternalDataFlow[] = [
  {
    id: "open-food-facts-search",
    destinationLabel: "Open Food Facts",
    trigger: "food-search",
    categories: ["food-search-term", "app-language"],
    consentMode: "required-for-feature",
    purpose: "Doğrulanabilir paketli gıda ve besin verisi aramak.",
  },
  {
    id: "open-food-facts-barcode",
    destinationLabel: "Open Food Facts",
    trigger: "barcode-lookup",
    categories: ["barcode"],
    consentMode: "required-for-feature",
    purpose: "Barkoddan ürün kaydı bulmak.",
  },
] as const;

export function validateExternalDataFlows(flows: readonly ExternalDataFlow[]): void {
  const ids = new Set<string>();
  for (const flow of flows) {
    if (!flow.id.trim()) throw new Error("Data-flow id is required");
    if (ids.has(flow.id)) throw new Error(`Duplicate data-flow id: ${flow.id}`);
    ids.add(flow.id);
    if (!flow.destinationLabel.trim()) throw new Error(`Destination label is required for ${flow.id}`);
    if (!flow.purpose.trim()) throw new Error(`Purpose is required for ${flow.id}`);
    if (flow.categories.length === 0) throw new Error(`At least one data category is required for ${flow.id}`);
  }
}

export function getFlowsForTrigger(trigger: DataFlowTrigger): ExternalDataFlow[] {
  return EXTERNAL_DATA_FLOWS.filter((flow) => flow.trigger === trigger);
}
