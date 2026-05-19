export type SextantNodeType =
  | "entry"
  | "step"
  | "branch"
  | "effect"
  | "error"
  | "return"
  | "subflow";

export interface SextantSource {
  mode?: "native" | "scan";
  file?: string;
  entry?: string;
  line?: number;
}

export interface SextantNodeDetails {
  summary?: string;
  rules?: string[];
  conditions?: string[];
  filters?: string[];
  inputs?: string[];
  outputs?: string[];
  responsibilities?: string[];
  system?: string;
  confidence?: number;
  source?: SextantSource;
  code?: {
    kind?: "call" | "condition" | "return" | "throw";
    call?: string;
    condition?: string;
    snippet?: string;
  };
}

export interface SextantOverlayNode {
  id: string;
  summary?: string;
  plainLanguage?: string;
  effect?: string;
  rules?: string[];
  conditions?: string[];
  filters?: string[];
  inputs?: string[];
  outputs?: string[];
  responsibilities?: string[];
  system?: string;
  confidence?: number;
}

export interface SextantOverlay {
  summary?: string;
  plainLanguage?: string;
  effect?: string;
  example?: {
    scenario?: string;
    input?: string;
    output?: string;
  };
  responsibilities?: string[];
  flow?: string[];
  risks?: string[];
  confidence?: number;
  nodes?: SextantOverlayNode[];
  suggestedSubflows?: Array<{
    id: string;
    label: string;
    nodeIds?: string[];
    summary?: string;
  }>;
}

export interface SextantNode {
  id: string;
  type: SextantNodeType;
  label: string;
  details?: SextantNodeDetails;
  subflow?: string;
  system?: string;
  confidence?: number;
}

export interface SextantEdge {
  from: string;
  to: string;
  label?: string;
}

export interface ProcessManifest {
  id: string;
  title: string;
  source?: SextantSource;
  nodes: SextantNode[];
  edges: SextantEdge[];
  subflows?: ProcessManifest[];
  details?: {
    summary?: string;
    risks?: string[];
  };
  overlay?: SextantOverlay;
  llm?: {
    provider: string;
    model: string;
    cache: "hit" | "miss";
    promptVersion: string;
    enriched: boolean;
  };
}

export interface WorkflowOptions {
  id?: string;
  source?: SextantSource;
}

export interface BranchDefinition {
  summary?: string;
  rules?: string[];
  conditions?: string[];
  filters?: string[];
  inputs?: string[];
  outputs?: string[];
  yes?: () => void;
  no?: () => void;
}

export declare function workflow(
  title: string,
  body: () => void,
  options?: WorkflowOptions
): ProcessManifest;

export declare function step(
  label: string,
  implementationOrDetails?: unknown | SextantNodeDetails,
  maybeDetails?: SextantNodeDetails
): SextantNode;

export declare function effect(
  label: string,
  implementationOrDetails?: unknown | SextantNodeDetails,
  maybeDetails?: SextantNodeDetails
): SextantNode;

export declare function branch(label: string, definition: BranchDefinition): SextantNode;

export declare function subflow(
  label: string,
  manifestOrFactory: ProcessManifest | (() => ProcessManifest),
  details?: SextantNodeDetails
): SextantNode;

export declare function getCurrentWorkflow(): ProcessManifest | null;

export declare function inferProcessFromSource(
  source: string,
  options: { entry: string; file?: string }
): ProcessManifest;

export interface LlmProvider {
  name: string;
  enrichProcess(context: unknown, options?: { model?: string }): Promise<unknown>;
}

export declare function enrichManifestWithLlm(
  source: string,
  manifest: ProcessManifest,
  options?: {
    entry?: string;
    file?: string;
    provider?: "deepseek" | string;
    model?: string;
    cache?: boolean;
    cacheDir?: string;
    providerInstance?: LlmProvider;
  }
): Promise<ProcessManifest>;

export declare function buildLlmContext(
  source: string,
  manifest: ProcessManifest,
  options: { entry?: string; file?: string }
): unknown;

export declare function createMockProvider(enrichment: unknown): LlmProvider & { readonly calls: number };

export declare function toMermaid(manifest: ProcessManifest): string;
export declare function toHtml(manifest: ProcessManifest, options?: { mermaid?: string }): string;
export declare function writeReport(
  manifest: ProcessManifest,
  outputFile: string
): Promise<{ html: string; mermaid: string; manifest: string }>;
