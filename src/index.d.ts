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
  source?: SextantSource;
}

export interface SextantNode {
  id: string;
  type: SextantNodeType;
  label: string;
  details?: SextantNodeDetails;
  subflow?: string;
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

export declare function toMermaid(manifest: ProcessManifest): string;
export declare function toHtml(manifest: ProcessManifest, options?: { mermaid?: string }): string;
export declare function writeReport(
  manifest: ProcessManifest,
  outputFile: string
): Promise<{ html: string; mermaid: string; manifest: string }>;
