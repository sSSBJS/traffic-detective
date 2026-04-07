import { useEffect, useMemo, useRef, useState } from "react";
import { HeaderNav } from "./components/HeaderNav";
import {
  createDecision,
  createEvaluation,
  createTrainingJob,
  getEvaluation,
  getHistory,
  getLatestEvaluation,
  getLatestReport,
  getSystemStatus,
  type Evaluation,
  type ForecastPoint,
  type HealthStatus,
  type HistoryResponse,
  type Report,
  type SystemStatus,
  type TrainingJob,
} from "./lib/api";

const healthLabels: Record<HealthStatus, string> = {
  healthy: "정상",
  warning: "주의",
  degraded: "저하",
  unknown: "대기",
};

const healthClasses: Record<HealthStatus, string> = {
  healthy: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  degraded: "border-rose-200 bg-rose-50 text-rose-800",
  unknown: "border-slate-200 bg-slate-100 text-slate-700",
};

const retrainingStatusClasses: Record<string, string> = {
  healthy: "border-emerald-200 bg-emerald-50 text-emerald-900",
  retrain_required: "border-rose-200 bg-rose-50 text-rose-900",
  pending: "border-slate-200 bg-slate-50 text-slate-700",
};

function isEvaluationActive(evaluation?: Evaluation | null) {
  return Boolean(
    evaluation &&
      ["queued", "running", "generating_report"].includes(evaluation.status),
  );
}

function formatDate(value?: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "요청 처리 중 오류가 발생했습니다.";
}

function delay(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function pollingDelayForStatus(status: Evaluation["status"]) {
  return status === "generating_report" ? 3000 : 850;
}

function buildPolyline(
  points: ForecastPoint[],
  key: "actual" | "predicted",
  width: number,
  height: number,
  minY: number,
  maxY: number,
) {
  const pad = 28;
  const plotWidth = width - pad * 2;
  const plotHeight = height - pad * 2;

  return points
    .map((point, index) => {
      const x = pad + (index / Math.max(points.length - 1, 1)) * plotWidth;
      const y = pad + (1 - (point[key] - minY) / Math.max(maxY - minY, 1)) * plotHeight;
      return `${x},${y}`;
    })
    .join(" ");
}

function ForecastChart({ points }: { points: ForecastPoint[] }) {
  if (!points.length) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
        성능 평가 실행 후 실제값과 예측값 그래프가 표시됩니다.
      </div>
    );
  }

  const width = 760;
  const height = 280;
  const allValues = points.flatMap((point) => [point.actual, point.predicted]);
  const minY = Math.min(...allValues) * 0.96;
  const maxY = Math.max(...allValues) * 1.04;

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-950 p-4">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="실제 네트워크 트래픽과 예측 트래픽 비교 그래프" className="h-72 w-full">
        {[0.25, 0.5, 0.75].map((ratio) => {
          const y = 28 + ratio * (height - 56);
          return (
            <line
              key={ratio}
              x1="28"
              y1={y}
              x2={width - 28}
              y2={y}
              stroke="rgba(148, 163, 184, 0.25)"
              strokeDasharray="5 7"
            />
          );
        })}
        <polyline
          points={buildPolyline(points, "actual", width, height, minY, maxY)}
          fill="none"
          stroke="#f8fafc"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polyline
          points={buildPolyline(points, "predicted", width, height, minY, maxY)}
          fill="none"
          stroke="#22d3ee"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-200">
        <span className="inline-flex items-center gap-2">
          <span className="h-2 w-5 rounded-sm bg-slate-50" />
          정답
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2 w-5 rounded-sm bg-cyan-400" />
          예측 결과
        </span>
      </div>
    </div>
  );
}

export default function App() {
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [trainingJob, setTrainingJob] = useState<TrainingJob | null>(null);
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [pollingEvaluationId, setPollingEvaluationId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [lastReportPromptReportId, setLastReportPromptReportId] = useState<string | null>(null);
  const activePollRef = useRef<{ evaluationId: string; token: number } | null>(null);

  const metricRows = useMemo(() => {
    if (!evaluation) {
      return [];
    }

    return [
      {
        label: "RMSE",
        current: evaluation.current_metrics.rmse,
        baseline: evaluation.baseline_metrics.rmse,
        change: `${evaluation.comparison.rmse_change_rate}%`,
      },
      {
        label: "SMAPE",
        current: evaluation.current_metrics.smape,
        baseline: evaluation.baseline_metrics.smape,
        change: `${evaluation.comparison.smape_change_rate}%`,
      },
      {
        label: "R2",
        current: evaluation.current_metrics.r2,
        baseline: evaluation.baseline_metrics.r2,
        change: `-${evaluation.comparison.r2_drop}`,
      },
    ];
  }, [evaluation]);

  async function refreshState() {
    const [statusData, evaluationData, reportData, historyData] =
      await Promise.all([
        getSystemStatus(),
        getLatestEvaluation(),
        getLatestReport(),
        getHistory(),
      ]);

    setSystemStatus(statusData);
    setEvaluation(evaluationData);
    setReport(reportData);
    setHistory(historyData);
    return evaluationData;
  }

  useEffect(() => {
    void (async () => {
      try {
        const latestEvaluation = await refreshState();
        if (latestEvaluation && isEvaluationActive(latestEvaluation)) {
          void pollEvaluation(latestEvaluation.evaluation_id);
        }
      } catch (loadError) {
        setError(getErrorMessage(loadError));
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (
      report?.status === "awaiting_user_decision" &&
      report.report_id !== lastReportPromptReportId
    ) {
      setIsReportModalOpen(true);
      setLastReportPromptReportId(report.report_id);
    }
  }, [lastReportPromptReportId, report]);

  async function runAction(actionName: string, action: () => Promise<void>) {
    setActiveAction(actionName);
    setError(null);
    setMessage(null);

    try {
      await action();
    } catch (actionError) {
      setError(getErrorMessage(actionError));
    } finally {
      setActiveAction(null);
    }
  }

  async function refreshSideData() {
    const [statusData, reportData, historyData] = await Promise.all([
      getSystemStatus(),
      getLatestReport(),
      getHistory(),
    ]);
    setSystemStatus(statusData);
    setHistory(historyData);
    return reportData;
  }

  async function pollEvaluation(
    evaluationId: string,
    options: { afterRetraining?: boolean; sourceReportId?: string } = {},
  ) {
    if (activePollRef.current?.evaluationId === evaluationId) {
      return;
    }
    const token = Date.now();
    activePollRef.current = { evaluationId, token };
    setPollingEvaluationId(evaluationId);
    setError(null);

    try {
      let nextEvaluation = await getEvaluation(evaluationId);
      if (activePollRef.current?.token !== token) {
        return;
      }
      setEvaluation(nextEvaluation);
      if (options.afterRetraining) {
        setTrainingJob((currentJob) =>
          currentJob?.followup_evaluation?.evaluation_id === evaluationId
            ? { ...currentJob, followup_evaluation: nextEvaluation }
            : currentJob,
        );
      }

      while (isEvaluationActive(nextEvaluation)) {
        await delay(pollingDelayForStatus(nextEvaluation.status));
        if (activePollRef.current?.token !== token) {
          return;
        }
        nextEvaluation = await getEvaluation(evaluationId);
        if (activePollRef.current?.token !== token) {
          return;
        }
        setEvaluation(nextEvaluation);
        if (options.afterRetraining) {
          setTrainingJob((currentJob) =>
            currentJob?.followup_evaluation?.evaluation_id === evaluationId
              ? { ...currentJob, followup_evaluation: nextEvaluation }
              : currentJob,
          );
        }
      }

      const latestReport = await refreshSideData();
      if (activePollRef.current?.token !== token) {
        return;
      }
      const shouldHideSourceReport =
        options.sourceReportId && latestReport?.report_id === options.sourceReportId;

      if (nextEvaluation.auto_report_created) {
        setReport(latestReport);
        setIsReportModalOpen(true);
        setMessage(
          options.afterRetraining
            ? "자동 재평가에서 다시 성능 저하가 감지되어 보고서가 생성되었습니다."
            : "성능 평가가 완료되었고, 저하 기준에 따라 보고서가 자동 생성되었습니다.",
        );
      } else {
        setReport(shouldHideSourceReport ? null : latestReport);
        setMessage(
          options.afterRetraining
            ? "재학습 후 자동 성능 평가가 완료되었습니다. 모든 배치가 재학습 불필요 상태입니다."
            : "성능 평가가 완료되었습니다. 모든 배치가 재학습 불필요 상태입니다.",
        );
      }
    } catch (pollError) {
      setError(getErrorMessage(pollError));
    } finally {
      if (activePollRef.current?.token === token) {
        activePollRef.current = null;
        setPollingEvaluationId(null);
      }
    }
  }

  async function handleEvaluation() {
    await runAction("evaluation", async () => {
      const startedEvaluation = await createEvaluation("manual");
      setEvaluation(startedEvaluation);
      setReport(null);
      setIsReportModalOpen(false);
      setMessage("7일 단위 배치 성능 평가를 시작했습니다.");
      void pollEvaluation(startedEvaluation.evaluation_id);
    });
  }

  async function handleRetrainRequest() {
    await runAction("retrain", async () => {
      if (!report) {
        throw new Error("먼저 보고서를 생성해주세요.");
      }
      const sourceReportId = report.report_id;

      const savedDecision = await createDecision(
        sourceReportId,
        "retrain",
        "최근 데이터 반영 재학습을 요청합니다.",
      );
      const nextJob = await createTrainingJob(savedDecision.decision_id);
      setTrainingJob(nextJob);
      if (nextJob.followup_evaluation) {
        setEvaluation(nextJob.followup_evaluation);
        void pollEvaluation(nextJob.followup_evaluation.evaluation_id, {
          afterRetraining: true,
          sourceReportId,
        });
      }
      const latestReport = await getLatestReport();
      setReport(latestReport?.report_id === sourceReportId ? null : latestReport);
      setIsReportModalOpen(false);
      setMessage("기존 모델을 덮어써 재학습했고, 자동 성능 평가 작업을 시작했습니다.");
    });
  }

  async function handleKeepCurrentModel() {
    await runAction("keep", async () => {
      if (!report) {
        throw new Error("먼저 보고서를 생성해주세요.");
      }

      const sourceReportId = report.report_id;
      await createDecision(
        sourceReportId,
        "keep_current_model",
        "현재 모델을 유지하고 재학습은 실행하지 않습니다.",
      );
      const latestReport = await getLatestReport();
      setReport(latestReport?.report_id === sourceReportId ? null : latestReport);
      setIsReportModalOpen(false);
      setMessage("현재 모델 유지로 결정했습니다. 재학습은 실행하지 않습니다.");
    });
  }

  const healthStatus = systemStatus?.latest_health_status ?? "unknown";
  const isCurrentEvaluationActive = isEvaluationActive(evaluation);
  const canRetrain =
    Boolean(report) &&
    !isCurrentEvaluationActive &&
    report?.status === "awaiting_user_decision";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <HeaderNav />

      <main className="mx-auto max-w-7xl space-y-8 px-5 py-8 lg:px-8">
        {error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {error}
          </div>
        ) : null}

        {message ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {message}
          </div>
        ) : null}

        <section id="dashboard" className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-soft">
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="m-0 text-sm font-semibold text-slate-500">운영 대시보드</p>
                <h1 className="m-0 mt-2 text-3xl font-bold text-slate-950">
                  Traffic AIOps Studio
                </h1>
              </div>
              <span
                className={`w-fit rounded-md border px-3 py-2 text-sm font-semibold ${healthClasses[healthStatus]}`}
              >
                {healthLabels[healthStatus]}
              </span>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-lg border border-slate-200 p-4">
                <p className="m-0 text-sm text-slate-500">Champion</p>
                <p className="m-0 mt-2 text-lg font-bold">
                  {systemStatus?.champion_model.model_name ?? "-"}
                </p>
                <p className="m-0 mt-1 text-sm text-slate-500">
                  {systemStatus?.champion_model.model_version_id ?? "-"}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 p-4">
                <p className="m-0 text-sm text-slate-500">마지막 학습</p>
                <p className="m-0 mt-2 text-lg font-bold">
                  {formatDate(systemStatus?.champion_model.trained_at)}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 p-4">
                <p className="m-0 text-sm text-slate-500">운영 지표</p>
                <p className="m-0 mt-2 text-lg font-bold">
                  {systemStatus?.target_config.metric ?? "-"}
                </p>
                <p className="m-0 mt-1 text-sm text-slate-500">
                  {systemStatus?.target_config.dataset_id ?? "-"} /{" "}
                  {systemStatus?.target_config.entity_id ?? "-"}
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => {
                  void handleEvaluation();
                }}
                disabled={activeAction === "evaluation" || isLoading || isCurrentEvaluationActive}
                className="rounded-md bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {activeAction === "evaluation" || isCurrentEvaluationActive ? "평가 중..." : "성능 평가 실행"}
              </button>
            </div>
            {activeAction === "evaluation" || isCurrentEvaluationActive ? (
              <div className="mt-6 rounded-lg border border-cyan-200 bg-cyan-50 p-4">
                <div className="h-2 overflow-hidden rounded-sm bg-cyan-100">
                  <div
                    className="h-full rounded-sm bg-cyan-600 transition-all"
                    style={{ width: `${Math.max(evaluation?.progress_percent ?? 8, 8)}%` }}
                  />
                </div>
                <p className="mb-0 mt-3 text-sm font-semibold text-cyan-900">
                  {evaluation?.current_batch
                    ? `${evaluation.current_batch.batch_id} 7일치 배치를 처리하는 중입니다.`
                    : "7일치 테스트 배치를 순서대로 만들고 성능지표를 확인하는 중입니다."}
                </p>
                <p className="mb-0 mt-1 text-sm text-cyan-800">
                  {evaluation?.batch_results.length ?? 0} / {evaluation?.total_batches ?? 0}개 완료
                  {pollingEvaluationId ? ` / ${pollingEvaluationId}` : ""}
                </p>
              </div>
            ) : null}
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-soft">
            <p className="m-0 text-sm font-semibold text-slate-500">최근 평가</p>
            {!evaluation ? (
              <p className="mb-0 mt-4 text-sm leading-6 text-slate-600">
                7일 단위 배치를 순차 테스트한 뒤 모델 result와 재학습 판단이 표시됩니다.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                  <strong>{evaluation.status}</strong> / 테스트 배치 {evaluation.batch_results.length}개
                  {evaluation.current_batch
                    ? ` / 처리 중 ${evaluation.current_batch.batch_id}`
                    : evaluation.failed_batch
                      ? ` / 중단 배치 ${evaluation.failed_batch.batch_id}`
                      : evaluation.status === "completed"
                        ? " / 재학습 불필요"
                        : ""}
                </div>
                {metricRows.map((metric) => (
                  <div
                    key={metric.label}
                    className="grid grid-cols-4 items-center gap-3 rounded-lg border border-slate-200 p-3 text-sm"
                  >
                    <span className="font-semibold">{metric.label}</span>
                    <span>현재 {metric.current}</span>
                    <span>기준 {metric.baseline}</span>
                    <span className="text-right font-semibold text-slate-700">
                      {metric.change}
                    </span>
                  </div>
                ))}
                <p className="m-0 pt-2 text-sm text-slate-500">
                  {evaluation.threshold_note}
                </p>
              </div>
            )}
          </div>
        </section>

        <section id="forecast" className="rounded-lg border border-slate-200 bg-white p-6 shadow-soft">
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="m-0 text-sm font-semibold text-slate-500">예측 비교 그래프</p>
              <h2 className="m-0 mt-2 text-2xl font-bold">정답 / 예측 결과</h2>
            </div>
            <p className="m-0 text-sm text-slate-500">
              {evaluation ? `${evaluation.forecast_points.length}개 포인트` : "평가 전"}
            </p>
          </div>
          <ForecastChart points={evaluation?.forecast_points ?? []} />
          {evaluation ? (
            <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="m-0 text-sm font-semibold text-slate-500">실시간 타임라인</p>
                  <h3 className="m-0 mt-1 text-lg font-bold text-slate-950">배치 테스트 결과</h3>
                </div>
                <p className="m-0 text-sm text-slate-500">
                  {evaluation.progress_percent}% / {evaluation.status}
                </p>
              </div>
              <div className="mt-4 space-y-3">
                {evaluation.batch_results.map((batch) => (
                  <div
                    key={batch.batch_id}
                    className={`rounded-lg border p-3 text-sm ${
                      retrainingStatusClasses[batch.retraining.status] ?? retrainingStatusClasses.pending
                    }`}
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="m-0 font-semibold">
                          {batch.batch_id} 테스트 완료 / {batch.retraining.status}
                        </p>
                        <p className="m-0 mt-1">
                          RMSE {batch.metrics.rmse} / SMAPE {batch.metrics.smape} / R2{" "}
                          {batch.metrics.r2}
                        </p>
                        <p className="m-0 mt-1">
                          {batch.model_result.display_name} / 기준 RMSE{" "}
                          {batch.retraining.previous_rmse ?? "-"} / 현재 RMSE{" "}
                          {batch.retraining.current_rmse ?? "-"}
                        </p>
                      </div>
                      <span className="text-xs font-semibold opacity-75">
                        {formatDate(batch.completed_at ?? batch.end_at)}
                      </span>
                    </div>
                  </div>
                ))}
                {evaluation.current_batch ? (
                  <div className="rounded-lg border border-cyan-200 bg-cyan-50 p-3 text-sm text-cyan-900">
                    <p className="m-0 font-semibold">
                      {evaluation.current_batch.batch_id} 테스트 중
                    </p>
                  </div>
                ) : null}
                {!evaluation.batch_results.length && !evaluation.current_batch ? (
                  <p className="m-0 rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
                    평가를 시작하면 완료된 배치부터 성능지표와 재학습 판단이 표시됩니다.
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
          {trainingJob ? (
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <strong>{trainingJob.job_id}</strong> / {trainingJob.status} / {trainingJob.progress}% /{" "}
              {trainingJob.current_stage}
              {trainingJob.model_update_result ? (
                <span>
                  {" "} / 모델 덮어쓰기 {trainingJob.model_update_result.status}
                </span>
              ) : null}
              {trainingJob.followup_evaluation ? (
                <span>
                  {" "} / 자동 재평가 {trainingJob.followup_evaluation.health_status}
                </span>
              ) : null}
            </div>
          ) : null}
        </section>

        <section id="session-history" className="rounded-lg border border-slate-200 bg-white p-6 shadow-soft">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="m-0 text-sm font-semibold text-slate-500">현재 세션 기록</p>
              <h2 className="m-0 mt-2 text-2xl font-bold">DB 저장 없음</h2>
            </div>
            <p className="m-0 text-sm text-slate-500">{history?.storage_mode ?? "memory_only"}</p>
          </div>
          <div className="mt-5 grid gap-3">
            {history?.items.length ? (
              history.items.map((item) => (
                <div
                  key={`${item.type}-${item.created_at}-${item.evaluation_id ?? item.report_id ?? item.job_id ?? item.promotion_id}`}
                  className="rounded-lg border border-slate-200 p-3 text-sm text-slate-700"
                >
                  <span className="font-semibold text-slate-950">{item.type}</span>{" "}
                  {formatDate(item.created_at)} / {item.storage}
                </div>
              ))
            ) : (
              <p className="m-0 text-sm text-slate-600">아직 세션 기록이 없습니다.</p>
            )}
          </div>
          <p className="mb-0 mt-4 text-sm text-slate-500">{history?.note}</p>
        </section>
      </main>

      {isReportModalOpen && report ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-5 py-6">
          <div className="max-h-full w-full max-w-5xl overflow-y-auto rounded-lg border border-slate-200 bg-white p-6 shadow-soft">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="m-0 text-sm font-semibold text-slate-500">평가 완료</p>
                <h2 className="m-0 mt-2 text-2xl font-bold">평가에 대한 보고서가 생성되었습니다.</h2>
              </div>
              <button
                type="button"
                onClick={() => setIsReportModalOpen(false)}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
              >
                닫기
              </button>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-600">
              현재 성능 결과는 {healthLabels[healthStatus]} 상태입니다.
              {healthStatus === "degraded" ? " 모델 result의 성능지표가 재학습 정책 기준을 넘어 재학습이 필요합니다." : " 보고서를 확인해 주세요."}
            </p>
            <div className="mt-5 grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
              <div>
                <p className="m-0 mb-3 text-sm font-semibold text-slate-500">
                  성능 저하 그래프
                </p>
                <ForecastChart points={evaluation?.forecast_points ?? []} />
              </div>
              <div>
                <p className="m-0 mb-3 text-sm font-semibold text-slate-500">
                  보고서
                </p>
                <div className="max-h-[28rem] overflow-y-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-800">
                  {report.markdown}
                </div>
              </div>
            </div>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => {
                  void handleKeepCurrentModel();
                }}
                disabled={!canRetrain || activeAction === "keep"}
                className="rounded-md border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-400"
              >
                현재 모델 유지
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleRetrainRequest();
                }}
                disabled={!canRetrain || activeAction === "retrain"}
                className="rounded-md bg-cyan-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-cyan-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                재학습 요청
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
