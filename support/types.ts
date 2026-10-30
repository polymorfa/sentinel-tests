export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export interface GateConfig {
  abprops?: Record<string, JsonValue>;
  gkx?: Record<string, boolean>;
  knobs?: Record<string, JsonValue>;
}
export interface GateUpdate {
  beforeProbe: string;
  gates: GateConfig;
}
export interface BehaviorContext {
  clock?: string;
  babelHelpers?: ('extends' | 'taggedTemplateLiteralLoose')[];
  timezone?: string;
  randomSeed?: number;
  gates?: GateConfig;
  gateUpdates?: GateUpdate[];
}
export interface ErrorExpectation {
  name?: string;
  message?: string;
}
export type Probe = {
  id: string;
  args: JsonValue[];
  export?: string;
  method?: string;
  clock?: string;
  result?: { method: string; args?: JsonValue[] };
} & ({ expected: JsonValue; throws?: never } | { expected?: never; throws: ErrorExpectation });
export interface BehaviorCase {
  schemaVersion: 1;
  id: string;
  version: number;
  title?: string;
  module: string;
  export: string;
  construct?: { args: JsonValue[] };
  context?: BehaviorContext;
  probes: Probe[];
  stubs?: { module: string; exports: JsonValue }[];
  variants?: Record<string, string>;
  sourceExpectation?: JsonValue;
}
export type CaseStatus =
  | 'pass'
  | 'assertion-failed'
  | 'load-error'
  | 'runtime-error'
  | 'timeout'
  | 'unsupported'
  | 'artifact-invalid';
export interface ProbeObservation {
  id: string;
  actual?: JsonValue;
  thrown?: ErrorExpectation;
  pass?: boolean;
}
export interface CaseResult {
  status: CaseStatus;
  probes?: ProbeObservation[];
  error?: { code?: string; message?: string };
  clockUpdates?: { beforeProbe: string; clock: string }[];
  gateUpdates?: {
    beforeProbe: string;
    epoch: number;
    gates: GateConfig;
    sequence?: number;
    source?: string;
  }[];
  gateObservations?: {
    kind: 'abprops' | 'gkx' | 'knobs';
    key: string;
    value?: JsonValue;
    resolved?: boolean;
    sequence: number;
    epoch?: number;
    probeId?: string | null;
    source?: string;
  }[];
}
export interface CaseComparison {
  status: 'unchanged' | 'changed' | 'inconclusive';
  baseline: CaseResult;
  candidate: CaseResult | null;
  reason?: string;
}
export interface Subject {
  id: string;
  capabilities?: readonly string[];
  /** Execute in a fresh scenario; retain state only between this case's own probes. */
  runCase(testCase: BehaviorCase): Promise<CaseResult>;
  compareCase?(testCase: BehaviorCase): Promise<CaseComparison>;
  close?(): void | Promise<void>;
}
export interface CaseMetadata {
  id: string;
  version: number;
  file: string;
  sourceModule: string;
  expectedComparison?: 'unchanged' | 'changed';
  coverage: string;
  notCovered: string[];
  revisionsObserved?: string[];
}
