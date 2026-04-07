export type HealthStatus = "healthy" | "warning" | "degraded" | "unknown";
export type DecisionType = "keep" | "keep_current_model" | "retrain";
export type ReportStatus = "created" | "awaiting_user_decision" | "closed";
export type TrainingJobStatus = "queued" | "running" | "completed" | "failed";
export type CandidateStatus = "candidate_ready" | "rejected" | "promoted";

export interface UploadResponse {
  result_visualizing_LSTM: string;
  result_evaluating_LSTM: string | number;
  result_visualizing_LSTM_v2: string;
  result_evaluating_LSTM_v2: string | number;
  saved_filename: string;
}

export interface Metrics {
  rmse: number;
  smape: number;
  r2: number;
}

export interface Comparison {
  rmse_change_rate: number;
  smape_change_rate: number;
  r2_drop: number;
}

export interface ForecastPoint {
  timestamp: string;
  actual: number;
  predicted: number;
}

export interface BatchResult {
  batch_id: string;
  batch_index: number;
  window_days: number;
  start_at: string;
  end_at: string;
  forecast_points: ForecastPoint[];
  metrics: Metrics;
  model_result: ForecastModelResult;
  retraining: RetrainingDecision;
  decision_reason: string;
  source: string;
  completed_at?: string;
}

export interface ForecastModelResult {
  model_key: string;
  display_name: string;
  order: string;
  rmse: number;
  smape: number;
  r2: number;
  predictions: number[];
  actuals: number[];
}

export interface RetrainingDecision {
  should_retrain: boolean;
  status: "pending" | "healthy" | "retrain_required";
  reasons: string[];
  threshold_ratio: number;
  stale_after_days: number;
  previous_rmse: number | null;
  current_rmse: number | null;
}

export interface TrainingScope {
  strategy: string;
  batch_ids: string[];
  until: string | null;
}

export interface CurrentBatch {
  batch_id: string;
  batch_index: number;
  window_days: number;
  start_at: string;
  end_at: string;
  status: "running";
}

export interface EvaluationTimelineEvent {
  status: string;
  message: string;
  created_at: string;
  batch_id?: string;
  batch_index?: number;
  start_at?: string;
  end_at?: string;
  metrics?: Metrics;
  retraining?: RetrainingDecision;
  decision_reason?: string;
}

export interface TargetConfig {
  dataset_id: string;
  entity_id: string;
  metric: string;
  evaluation_interval: string;
  retraining_window_days: number;
  batch_unit: string;
  batch_size: number;
}

export interface ChampionModel {
  model_version_id: string;
  model_name: string;
  trained_at: string;
  rmse: number | null;
  smape: number | null;
  r2: number | null;
  status: "champion";
}

export interface RuntimeModel {
  model_version_id: string;
  model_name: string;
  artifact_path: string | null;
  trained_at: string;
  activated_at: string | null;
  loader_module: string | null;
  load_status: string;
  source: string;
  metadata: Record<string, unknown>;
}

export interface SystemStatus {
  system_name: string;
  target_config: TargetConfig;
  champion_model: ChampionModel;
  runtime_model: RuntimeModel;
  latest_health_status: HealthStatus;
  latest_evaluation_id: string | null;
  storage_mode: "memory_only";
}

export interface Evaluation {
  evaluation_id: string;
  model_version_id: string;
  status: "queued" | "running" | "generating_report" | "completed" | "stopped_on_retrain_required" | "failed";
  trigger_type: "manual" | "scheduled";
  current_metrics: Metrics;
  baseline_metrics: Metrics;
  comparison: Comparison;
  health_status: HealthStatus;
  recommended_action: string;
  threshold_note: string;
  batch_size_days: number;
  total_batches: number;
  batch_results: BatchResult[];
  failed_batch: BatchResult | null;
  retraining: RetrainingDecision;
  training_scope: TrainingScope;
  forecast_points: ForecastPoint[];
  auto_report_created: boolean;
  auto_report_id: string | null;
  after_retraining: boolean;
  batch_delay_seconds: number;
  progress_percent: number;
  current_batch: CurrentBatch | null;
  timeline_events: EvaluationTimelineEvent[];
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface Report {
  report_id: string;
  evaluation_id: string;
  summary: string;
  details: Record<string, string>;
  possible_causes: string[];
  recommended_actions: string[];
  markdown: string;
  report_source: "gpt" | "fallback_missing_openai_api_key" | "fallback_openai_error" | "fallback_empty_openai_response";
  generation_error: string | null;
  status: ReportStatus;
  created_at: string;
}

export interface Decision {
  decision_id: string;
  report_id: string;
  decision: DecisionType;
  comment: string | null;
  status: "accepted";
  created_at: string;
}

export interface TrainingJob {
  job_id: string;
  decision_id: string;
  status: TrainingJobStatus;
  progress: number;
  current_stage: string;
  created_candidate_model_version_id: string | null;
  policy: {
    retraining_window_days: number;
    batch_unit: string;
    batch_size: number;
  };
  note: string;
  model_update_result: {
    previous_model: RuntimeModel;
    active_model: RuntimeModel;
    status: "updated" | "overwritten";
    training_batch_count?: number;
  } | null;
  source_evaluation_id: string;
  training_scope: TrainingScope;
  followup_evaluation: Evaluation | null;
  created_at: string;
  finished_at: string | null;
}

export interface CandidateModel {
  candidate_model_version_id: string;
  model_name: string;
  metrics: Metrics;
  comparison_with_champion: {
    is_better: boolean;
    reason: string;
  };
  status: CandidateStatus;
  is_placeholder: boolean;
  created_at: string;
}

export interface PromotionResult {
  promotion_id: string;
  previous_champion: string;
  new_champion: string;
  status: "promoted";
  created_at: string;
}

export interface SessionEvent {
  type: string;
  created_at: string;
  storage: "memory_only";
  evaluation_id?: string;
  health_status?: HealthStatus;
  report_id?: string;
  report_source?: string;
  decision_id?: string;
  decision?: DecisionType;
  job_id?: string;
  candidate_model_version_id?: string;
  promotion_id?: string;
  previous_champion?: string;
  new_champion?: string;
  status?: string;
}

export interface HistoryResponse {
  storage_mode: "memory_only";
  items: SessionEvent[];
  note: string;
}

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  message: string;
}

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL?.trim() || "http://localhost:8001"
).replace(/\/+$/, "");

function buildUrl(path: string) {
  if (/^https?:\/\//.test(path)) {
    return path;
  }

  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

async function parseError(response: Response) {
  try {
    const data = await response.json();
    if (typeof data?.detail === "string") {
      return data.detail;
    }
    if (typeof data?.message === "string") {
      return data.message;
    }
  } catch (_error) {
    // Ignore invalid JSON responses and fall back to status text.
  }

  return response.statusText || "요청 처리 중 오류가 발생했습니다.";
}

async function requestApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(buildUrl(path), {
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
    ...init,
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  const payload = (await response.json()) as ApiEnvelope<T>;
  return payload.data;
}

export async function getSystemStatus() {
  return requestApi<SystemStatus>("/api/v1/system/status");
}

export async function createEvaluation(triggerType: "manual" | "scheduled" = "manual") {
  return requestApi<Evaluation>("/api/v1/evaluations", {
    method: "POST",
    body: JSON.stringify({ trigger_type: triggerType }),
  });
}

export async function getLatestEvaluation() {
  return requestApi<Evaluation | null>("/api/v1/evaluations/latest");
}

export async function getEvaluation(evaluationId: string) {
  return requestApi<Evaluation>(`/api/v1/evaluations/${evaluationId}`);
}

export async function createReport(evaluationId?: string) {
  return requestApi<Report>("/api/v1/reports", {
    method: "POST",
    body: JSON.stringify(evaluationId ? { evaluation_id: evaluationId } : {}),
  });
}

export async function getLatestReport() {
  return requestApi<Report | null>("/api/v1/reports/latest");
}

export async function getReports() {
  return requestApi<Report[]>("/api/v1/reports");
}

export async function downloadReport(reportId: string) {
  const response = await fetch(buildUrl(`/api/v1/reports/${reportId}/download`));

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  return await response.blob();
}

export async function createDecision(reportId: string, decision: DecisionType, comment: string) {
  return requestApi<Decision>("/api/v1/decisions", {
    method: "POST",
    body: JSON.stringify({ report_id: reportId, decision, comment }),
  });
}

export async function createTrainingJob(decisionId: string) {
  return requestApi<TrainingJob>("/api/v1/training-jobs", {
    method: "POST",
    body: JSON.stringify({ decision_id: decisionId }),
  });
}

export async function getLatestCandidate() {
  return requestApi<CandidateModel | null>("/api/v1/model-candidates/latest");
}

export async function promoteModel(modelVersionId: string) {
  return requestApi<PromotionResult>(`/api/v1/model-versions/${modelVersionId}/promote`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function getHistory() {
  return requestApi<HistoryResponse>("/api/v1/history");
}

export async function uploadDataset(file: File): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(buildUrl("/upload"), {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  return (await response.json()) as UploadResponse;
}

export async function downloadResultImage() {
  const response = await fetch(buildUrl("/download"));

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  return await response.blob();
}

export { API_BASE_URL };
