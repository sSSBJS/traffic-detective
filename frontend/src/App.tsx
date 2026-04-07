import { useEffect, useId, useMemo, useState } from "react";
import { HeaderNav } from "./components/HeaderNav";
import { ReportMarkdown } from "./components/ReportMarkdown";
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
  healthy:
    "border-emerald-500/35 bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/20",
  warning: "border-amber-500/35 bg-amber-500/10 text-amber-200 ring-1 ring-amber-500/20",
  degraded: "border-rose-500/35 bg-rose-500/10 text-rose-300 ring-1 ring-rose-500/20",
  unknown: "border-zinc-600 bg-zinc-800/90 text-zinc-300 ring-1 ring-zinc-700/80",
};

const retrainingStatusLabel: Record<string, string> = {
  healthy: "정상",
  retrain_required: "재학습 권장",
  pending: "대기",
};

function retrainingStatusTextClass(status: string) {
  if (status === "healthy") {
    return "text-emerald-400";
  }
  if (status === "retrain_required") {
    return "text-rose-400";
  }
  return "text-zinc-400";
}

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

function formatChartTime(iso: string) {
  try {
    return new Intl.DateTimeFormat("ko-KR", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatAxisNumber(n: number) {
  if (!Number.isFinite(n)) {
    return "-";
  }
  const abs = Math.abs(n);
  if (abs >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(2)}M`;
  }
  if (abs >= 1_000) {
    return `${(n / 1_000).toFixed(2)}k`;
  }
  return n.toFixed(2);
}

function chartCoords(
  points: ForecastPoint[],
  key: "actual" | "predicted",
  width: number,
  height: number,
  minY: number,
  maxY: number,
) {
  const padL = 52;
  const padR = 24;
  const padT = 24;
  const padB = 48;
  const plotWidth = width - padL - padR;
  const plotHeight = height - padT - padB;
  const span = Math.max(maxY - minY, 1e-9);

  return points.map((point, index) => {
    const x = padL + (index / Math.max(points.length - 1, 1)) * plotWidth;
    const y = padT + (1 - (point[key] - minY) / span) * plotHeight;
    return { x, y };
  });
}

function coordsToPolyline(coords: { x: number; y: number }[]) {
  return coords.map((c) => `${c.x},${c.y}`).join(" ");
}

function buildAreaPath(coords: { x: number; y: number }[], bottomY: number) {
  if (!coords.length) {
    return "";
  }
  const first = coords[0];
  const last = coords[coords.length - 1];
  let d = `M ${first.x} ${bottomY} L ${first.x} ${first.y}`;
  for (let i = 1; i < coords.length; i++) {
    d += ` L ${coords[i].x} ${coords[i].y}`;
  }
  d += ` L ${last.x} ${bottomY} Z`;
  return d;
}

function ForecastChart({ points, compact }: { points: ForecastPoint[]; compact?: boolean }) {
  const chartUid = useId().replace(/:/g, "");

  if (!points.length) {
    return (
      <div
        className={`flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-700/80 bg-zinc-900/40 px-6 text-center ${compact ? "min-h-[140px] py-8" : "min-h-[220px] py-12"}`}
      >
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-800 text-zinc-500">
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M4 18V6M8 14V10M12 16V8M16 12V10M20 14V6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <p className="m-0 text-sm font-medium text-zinc-300">아직 표시할 시계열이 없습니다</p>
        <p className="mt-1 max-w-sm text-xs leading-relaxed text-zinc-500">
          성능 평가를 실행하면 실제값과 예측값이 같은 축에서 비교됩니다.
        </p>
      </div>
    );
  }

  const width = 800;
  const height = 300;
  const allValues = points.flatMap((point) => [point.actual, point.predicted]);
  const minY = Math.min(...allValues) * 0.98;
  const maxY = Math.max(...allValues) * 1.02;
  const bottomY = height - 48;
  const actualCoords = chartCoords(points, "actual", width, height, minY, maxY);
  const predictedCoords = chartCoords(points, "predicted", width, height, minY, maxY);
  const xLabelIdx = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])].sort(
    (a, b) => a - b,
  );

  return (
    <div
      className={`overflow-hidden rounded-2xl border border-zinc-700/80 bg-zinc-900/60 shadow-lg shadow-black/20 ring-1 ring-violet-500/10 ${compact ? "shadow-sm" : ""}`}
    >
      <div className={`border-b border-zinc-700/80 bg-zinc-900/90 ${compact ? "px-3 py-2" : "px-4 py-3 sm:px-5"}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p
            className={`m-0 font-semibold uppercase tracking-wide text-zinc-500 ${compact ? "text-[10px]" : "text-xs"}`}
          >
            시계열 비교
          </p>
          <div
            className={`flex flex-wrap items-center gap-3 text-zinc-400 ${compact ? "gap-2 text-[10px]" : "text-xs"}`}
          >
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-6 rounded-full bg-zinc-300" />
              실제값
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-6 rounded-full bg-violet-400" />
              예측
            </span>
          </div>
        </div>
      </div>
      <div className={compact ? "p-2" : "p-3 sm:p-4"}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="실제 네트워크 트래픽과 예측 트래픽 비교 그래프"
          className={`h-auto w-full ${compact ? "max-h-[200px]" : "max-h-[320px]"}`}
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <linearGradient id={`areaActual-${chartUid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgb(212 212 216)" stopOpacity="0.14" />
              <stop offset="100%" stopColor="rgb(212 212 216)" stopOpacity="0" />
            </linearGradient>
            <linearGradient id={`areaPred-${chartUid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgb(167 139 250)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="rgb(167 139 250)" stopOpacity="0" />
            </linearGradient>
            <filter id={`lineShadow-${chartUid}`} x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="1" stdDeviation="1" floodOpacity="0.12" />
            </filter>
          </defs>

          <rect x="0" y="0" width={width} height={height} fill="rgb(24 24 27)" />

          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = 24 + ratio * (height - 72);
            return (
              <line
                key={ratio}
                x1="52"
                y1={y}
                x2={width - 24}
                y2={y}
                stroke="rgb(63 63 70)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}

          {[0, 0.33, 0.66, 1].map((ratio) => {
            const x = 52 + ratio * (width - 76);
            return (
              <line
                key={ratio}
                x1={x}
                y1="24"
                x2={x}
                y2={height - 48}
                stroke="rgb(39 39 42)"
                strokeWidth="1"
              />
            );
          })}

          <path
            d={buildAreaPath(actualCoords, bottomY)}
            fill={`url(#areaActual-${chartUid})`}
          />
          <path
            d={buildAreaPath(predictedCoords, bottomY)}
            fill={`url(#areaPred-${chartUid})`}
          />

          <polyline
            points={coordsToPolyline(actualCoords)}
            fill="none"
            stroke="rgb(212 212 216)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter={`url(#lineShadow-${chartUid})`}
          />
          <polyline
            points={coordsToPolyline(predictedCoords)}
            fill="none"
            stroke="rgb(167 139 250)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter={`url(#lineShadow-${chartUid})`}
          />

          <text x="8" y="32" fill="rgb(161 161 170)" fontSize="11" fontFamily="inherit">
            {formatAxisNumber(maxY)}
          </text>
          <text
            x="8"
            y={24 + (height - 72) / 2 + 4}
            fill="rgb(161 161 170)"
            fontSize="11"
            fontFamily="inherit"
          >
            {formatAxisNumber((minY + maxY) / 2)}
          </text>
          <text x="8" y={height - 52} fill="rgb(161 161 170)" fontSize="11" fontFamily="inherit">
            {formatAxisNumber(minY)}
          </text>

          {xLabelIdx.map((idx) => {
            const pt = points[idx];
            if (!pt) {
              return null;
            }
            const x = actualCoords[idx]?.x ?? 52;
            return (
              <text
                key={idx}
                x={x}
                y={height - 18}
                textAnchor="middle"
                fill="rgb(161 161 170)"
                fontSize="10"
              >
                {formatChartTime(pt.timestamp)}
              </text>
            );
          })}
        </svg>
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
    setPollingEvaluationId(evaluationId);
    setError(null);

    try {
      let nextEvaluation = await getEvaluation(evaluationId);
      setEvaluation(nextEvaluation);
      if (options.afterRetraining) {
        setTrainingJob((currentJob) =>
          currentJob?.followup_evaluation?.evaluation_id === evaluationId
            ? { ...currentJob, followup_evaluation: nextEvaluation }
            : currentJob,
        );
      }

      while (isEvaluationActive(nextEvaluation)) {
        await delay(850);
        nextEvaluation = await getEvaluation(evaluationId);
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
      setPollingEvaluationId(null);
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
    <div className="min-h-screen text-zinc-200">
      <HeaderNav />

      <main className="mx-auto max-w-7xl space-y-10 px-5 py-10 lg:px-8">
        {error ? (
          <div
            className="flex gap-3 rounded-2xl border border-rose-500/35 bg-rose-950/40 px-4 py-3.5 text-sm text-rose-200 shadow-sm ring-1 ring-rose-500/20"
            role="alert"
          >
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-500/25 text-xs font-bold text-rose-300">
              !
            </span>
            <span className="leading-relaxed">{error}</span>
          </div>
        ) : null}

        {message ? (
          <div className="flex gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-950/35 px-4 py-3.5 text-sm text-emerald-100 shadow-sm ring-1 ring-emerald-500/20">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300">
              <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" aria-hidden>
                <path
                  d="M2.5 6l2.5 2.5L9.5 3.5"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span className="leading-relaxed">{message}</span>
          </div>
        ) : null}

        <section id="dashboard" className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="relative overflow-hidden rounded-2xl border border-zinc-800/90 bg-zinc-900/50 p-6 shadow-xl shadow-black/20 ring-1 ring-violet-500/10 backdrop-blur-sm">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-violet-600 via-violet-800 to-zinc-950" />
            <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="m-0 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  운영 대시보드
                </p>
                <h1 className="m-0 mt-2 text-3xl font-semibold tracking-tight text-zinc-100">
                  Traffic AIOps Studio
                </h1>
                <p className="m-0 mt-2 max-w-xl text-sm leading-relaxed text-zinc-400">
                  고정된 운영 대상에 대해 성능을 점검하고, 필요 시 보고서·재학습 흐름으로 이어집니다.
                </p>
              </div>
              <span
                className={`inline-flex w-fit items-center rounded-full border px-4 py-2 text-sm font-semibold shadow-sm ${healthClasses[healthStatus]}`}
              >
                {healthLabels[healthStatus]}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:gap-4">
              <div className="min-w-0 rounded-xl border border-zinc-700/80 bg-zinc-950/50 p-3 ring-1 ring-violet-500/5 sm:p-4">
                <p className="m-0 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 sm:text-xs">
                  Champion
                </p>
                <p className="tabular-nums-pro m-0 mt-1.5 truncate text-sm font-semibold text-zinc-100 sm:mt-2 sm:text-lg">
                  {systemStatus?.champion_model.model_name ?? "—"}
                </p>
                <p className="m-0 mt-0.5 truncate font-mono text-[10px] text-zinc-500 sm:text-xs">
                  {systemStatus?.champion_model.model_version_id ?? "—"}
                </p>
              </div>
              <div className="min-w-0 rounded-xl border border-zinc-700/80 bg-zinc-950/50 p-3 ring-1 ring-violet-500/5 sm:p-4">
                <p className="m-0 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 sm:text-xs">
                  마지막 학습
                </p>
                <p className="m-0 mt-1.5 break-words text-sm font-semibold leading-snug text-zinc-100 sm:mt-2 sm:text-lg">
                  {formatDate(systemStatus?.champion_model.trained_at)}
                </p>
              </div>
              <div className="min-w-0 rounded-xl border border-zinc-700/80 bg-zinc-950/50 p-3 ring-1 ring-violet-500/5 sm:p-4">
                <p className="m-0 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 sm:text-xs">
                  운영 지표
                </p>
                <p className="m-0 mt-1.5 truncate text-sm font-semibold text-zinc-100 sm:mt-2 sm:text-lg">
                  {systemStatus?.target_config.metric ?? "—"}
                </p>
                <p className="m-0 mt-0.5 break-words text-[10px] leading-snug text-zinc-400 sm:text-xs">
                  {systemStatus?.target_config.dataset_id ?? "—"} ·{" "}
                  {systemStatus?.target_config.entity_id ?? "—"}
                </p>
              </div>
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => {
                  void handleEvaluation();
                }}
                disabled={activeAction === "evaluation" || isLoading || isCurrentEvaluationActive}
                className="inline-flex items-center justify-center rounded-xl bg-gradient-to-b from-violet-600 to-violet-800 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-950/40 ring-1 ring-violet-400/20 transition hover:from-violet-500 hover:to-violet-700 disabled:cursor-not-allowed disabled:from-zinc-700 disabled:to-zinc-800 disabled:text-zinc-500 disabled:shadow-none disabled:ring-0"
              >
                {activeAction === "evaluation" || isCurrentEvaluationActive
                  ? "평가 중…"
                  : "성능 평가 실행"}
              </button>
            </div>
            {activeAction === "evaluation" || isCurrentEvaluationActive ? (
              <div className="mt-8 overflow-hidden rounded-2xl border border-violet-500/25 bg-gradient-to-br from-violet-950/40 to-zinc-950/80 p-5 ring-1 ring-violet-500/15">
                <div className="mb-1 flex items-center justify-between text-xs font-medium text-violet-200">
                  <span>배치 진행률</span>
                  <span className="tabular-nums-pro">{evaluation?.progress_percent ?? 0}%</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-violet-500 to-violet-400 transition-all duration-300"
                    style={{ width: `${Math.max(evaluation?.progress_percent ?? 8, 8)}%` }}
                  />
                </div>
                <p className="mb-0 mt-4 text-sm font-semibold leading-snug text-zinc-100">
                  {evaluation?.current_batch
                    ? `${evaluation.current_batch.batch_id} · 7일치 배치 처리 중`
                    : "테스트 배치를 준비하고 성능 지표를 집계하는 중입니다."}
                </p>
                <p className="mb-0 mt-2 text-xs leading-relaxed text-zinc-400">
                  완료 {evaluation?.batch_results.length ?? 0} / 전체 {evaluation?.total_batches ?? 0} 배치
                  {pollingEvaluationId ? (
                    <span className="ml-2 font-mono text-violet-400/80">· {pollingEvaluationId}</span>
                  ) : null}
                </p>
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl border border-zinc-800/90 bg-zinc-900/50 p-6 shadow-xl shadow-black/20 ring-1 ring-violet-500/10 backdrop-blur-sm">
            <div className="border-b border-zinc-800 pb-4">
              <p className="m-0 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                최근 평가
              </p>
              <p className="m-0 mt-1 text-sm text-zinc-400">집계된 지표와 기준선 대비 변화</p>
            </div>
            {!evaluation ? (
              <p className="mb-0 mt-6 text-sm leading-relaxed text-zinc-400">
                7일 단위 배치를 순차 테스트한 뒤 모델 결과와 재학습 판단이 여기에 표시됩니다.
              </p>
            ) : (
              <div className="mt-5 space-y-4">
                <div className="rounded-xl border border-zinc-700/80 bg-zinc-950/50 px-3 py-2.5 text-sm text-zinc-300 ring-1 ring-zinc-800/80">
                  <span className="font-semibold capitalize text-zinc-100">{evaluation.status}</span>
                  <span className="text-zinc-500"> · 배치 {evaluation.batch_results.length}건</span>
                  {evaluation.current_batch ? (
                    <span className="text-zinc-400"> · 처리 중 {evaluation.current_batch.batch_id}</span>
                  ) : null}
                  {evaluation.failed_batch ? (
                    <span className="text-rose-400"> · 중단 {evaluation.failed_batch.batch_id}</span>
                  ) : null}
                  {evaluation.status === "completed" && !evaluation.failed_batch ? (
                    <span className="text-emerald-400"> · 재학습 불필요</span>
                  ) : null}
                </div>

                <div className="overflow-hidden rounded-xl border border-zinc-700/90">
                  <div className="grid grid-cols-4 gap-2 border-b border-zinc-800 bg-zinc-950/60 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                    <span>지표</span>
                    <span className="text-right">현재</span>
                    <span className="text-right">기준</span>
                    <span className="text-right">변화</span>
                  </div>
                  {metricRows.map((metric) => (
                    <div
                      key={metric.label}
                      className="grid grid-cols-4 items-center gap-2 border-b border-zinc-800/90 px-3 py-2.5 text-sm text-zinc-300 last:border-b-0"
                    >
                      <span className="font-semibold text-zinc-200">{metric.label}</span>
                      <span className="tabular-nums-pro text-right text-zinc-100">{metric.current}</span>
                      <span className="tabular-nums-pro text-right text-zinc-400">{metric.baseline}</span>
                      <span className="tabular-nums-pro text-right font-medium text-zinc-200">
                        {metric.change}
                      </span>
                    </div>
                  ))}
                </div>

                <p className="m-0 rounded-lg bg-zinc-950/50 px-3 py-2 text-xs leading-relaxed text-zinc-400 ring-1 ring-zinc-800/80">
                  {evaluation.threshold_note}
                </p>
              </div>
            )}
          </div>
        </section>

        <section
          id="forecast"
          className="overflow-hidden rounded-2xl border border-zinc-800/90 bg-zinc-900/40 shadow-xl shadow-black/25 ring-1 ring-violet-500/10"
        >
          <div className="border-b border-zinc-800 bg-gradient-to-r from-zinc-900/90 to-zinc-950/90 px-6 py-5 sm:px-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="m-0 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  예측 비교
                </p>
                <h2 className="m-0 mt-1 text-2xl font-semibold tracking-tight text-zinc-100">
                  실제값 · 예측값
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-zinc-800 px-3 py-1 text-xs font-medium text-zinc-300 ring-1 ring-zinc-700/80">
                  {evaluation ? `${evaluation.forecast_points.length} 포인트` : "평가 전"}
                </span>
              </div>
            </div>
          </div>
          <div className="p-6 sm:p-8 sm:pt-6">
            <ForecastChart points={evaluation?.forecast_points ?? []} />
          </div>

          <div id="report" className="scroll-mt-28 border-t border-zinc-800 bg-zinc-950/30 px-6 py-8 sm:px-8">
            {evaluation ? (
              <div>
                <div className="mb-5 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                  <h3 className="m-0 text-lg font-semibold text-zinc-100">배치 테스트 결과</h3>
                  <p className="m-0 text-sm text-zinc-500">
                    <span className="tabular-nums-pro font-medium text-violet-300">
                      {evaluation.progress_percent}%
                    </span>
                    <span className="mx-1.5 text-zinc-600">·</span>
                    <span className="capitalize">{evaluation.status}</span>
                  </p>
                </div>

                <div className="overflow-hidden rounded-lg border border-zinc-700/90">
                  {evaluation.batch_results.map((batch, rowIdx) => {
                    const statusKey = batch.retraining.status;
                    const statusKo = retrainingStatusLabel[statusKey] ?? statusKey;
                    const statusCls = retrainingStatusTextClass(statusKey);
                    return (
                      <div
                        key={batch.batch_id}
                        className={`border-b border-zinc-800 px-4 py-4 last:border-b-0 ${rowIdx % 2 === 0 ? "bg-zinc-900/40" : "bg-zinc-950/50"}`}
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                              <span className="font-mono text-sm font-medium text-zinc-100">
                                {batch.batch_id}
                              </span>
                              <span className={`text-sm font-medium ${statusCls}`}>{statusKo}</span>
                            </div>
                            <div className="mt-4 grid max-w-2xl grid-cols-3 gap-x-5 gap-y-3 sm:gap-x-10 sm:gap-y-4">
                              {[
                                { k: "RMSE", v: batch.metrics.rmse },
                                { k: "SMAPE", v: batch.metrics.smape },
                                { k: "R²", v: batch.metrics.r2 },
                              ].map((cell) => (
                                <div
                                  key={cell.k}
                                  className="min-w-0 rounded-lg border border-zinc-700/70 bg-zinc-950/60 px-3 py-3 sm:px-4 sm:py-3.5"
                                >
                                  <p className="m-0 text-[11px] font-medium text-zinc-500">{cell.k}</p>
                                  <p className="tabular-nums-pro m-0 mt-1.5 text-base font-semibold text-zinc-100 sm:text-lg">
                                    {cell.v}
                                  </p>
                                </div>
                              ))}
                            </div>
                            <p className="m-0 mt-3 text-xs leading-relaxed text-zinc-400">
                              {batch.model_result.display_name}
                              <span className="mx-2 text-zinc-600">·</span>
                              기준 RMSE{" "}
                              <span className="tabular-nums-pro text-zinc-200">
                                {batch.retraining.previous_rmse ?? "—"}
                              </span>
                              <span className="mx-2 text-zinc-600">·</span>
                              현재 RMSE{" "}
                              <span className="tabular-nums-pro text-zinc-200">
                                {batch.retraining.current_rmse ?? "—"}
                              </span>
                            </p>
                          </div>
                          <time className="shrink-0 text-xs tabular-nums text-zinc-500 sm:text-right">
                            {formatDate(batch.completed_at ?? batch.end_at)}
                          </time>
                        </div>
                      </div>
                    );
                  })}

                  {evaluation.current_batch ? (
                    <div className="border-t border-dashed border-zinc-700 bg-zinc-950/60 px-4 py-3">
                      <p className="m-0 font-mono text-sm text-zinc-200">{evaluation.current_batch.batch_id}</p>
                      <p className="m-0 mt-1 text-xs text-zinc-500">이 배치를 평가하는 중입니다.</p>
                    </div>
                  ) : null}

                  {!evaluation.batch_results.length && !evaluation.current_batch ? (
                    <p className="m-0 px-4 py-10 text-center text-sm text-zinc-500">
                      평가를 시작하면 배치별 지표가 여기에 쌓입니다.
                    </p>
                  ) : null}
                </div>
              </div>
            ) : (
              <p className="m-0 text-center text-sm text-zinc-500">
                평가를 실행하면 배치별 결과가 표시됩니다.
              </p>
            )}

            {trainingJob ? (
              <div className="mt-8 overflow-hidden rounded-2xl border border-zinc-800/90 bg-zinc-900/50 p-5 shadow-lg ring-1 ring-violet-500/10">
                <p className="m-0 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  재학습 작업
                </p>
                <div className="mt-3 flex flex-wrap items-baseline gap-2">
                  <span className="font-mono text-sm font-semibold text-zinc-100">{trainingJob.job_id}</span>
                  <span className="rounded-md bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-300 ring-1 ring-zinc-700">
                    {trainingJob.status}
                  </span>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="m-0 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                      진행률
                    </p>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-zinc-800">
                      <div
                        className="h-full rounded-full bg-violet-500 transition-all"
                        style={{ width: `${Math.min(100, trainingJob.progress)}%` }}
                      />
                    </div>
                    <p className="tabular-nums-pro m-0 mt-1 text-xs text-zinc-400">
                      {trainingJob.progress}% · {trainingJob.current_stage}
                    </p>
                  </div>
                  <div className="space-y-1 text-xs text-zinc-400">
                    {trainingJob.model_update_result ? (
                      <p className="m-0">
                        모델 반영:{" "}
                        <span className="font-medium text-zinc-100">
                          {trainingJob.model_update_result.status}
                        </span>
                      </p>
                    ) : null}
                    {trainingJob.followup_evaluation ? (
                      <p className="m-0">
                        자동 재평가:{" "}
                        <span className="font-medium text-zinc-100">
                          {trainingJob.followup_evaluation.health_status}
                        </span>
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </section>

        <section
          id="session-history"
          className="rounded-2xl border border-zinc-800/90 bg-zinc-900/50 p-6 shadow-xl shadow-black/20 ring-1 ring-violet-500/10 sm:p-8"
        >
          <div className="flex flex-col gap-3 border-b border-zinc-800 pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="m-0 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                현재 세션 기록
              </p>
              <h2 className="m-0 mt-1 text-2xl font-semibold tracking-tight text-zinc-100">
                세션 기록
              </h2>
            </div>
            <span className="w-fit rounded-full bg-zinc-800 px-3 py-1 text-xs font-medium text-zinc-300 ring-1 ring-zinc-700/80">
              {history?.storage_mode ?? "memory_only"}
            </span>
          </div>
          <div className="mt-6 grid gap-2">
            {history?.items.length ? (
              history.items.map((item) => (
                <div
                  key={`${item.type}-${item.created_at}-${item.evaluation_id ?? item.report_id ?? item.job_id ?? item.promotion_id}`}
                  className="flex flex-col gap-1 rounded-xl border border-zinc-800/90 bg-zinc-950/40 px-4 py-3 text-sm text-zinc-400 ring-1 ring-zinc-800/80 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="font-semibold text-zinc-200">{item.type}</span>
                  <span className="text-xs text-zinc-500 sm:text-sm">
                    {formatDate(item.created_at)} · {item.storage}
                  </span>
                </div>
              ))
            ) : (
              <p className="m-0 rounded-xl border border-dashed border-zinc-700 bg-zinc-950/40 px-4 py-8 text-center text-sm text-zinc-500">
                아직 세션 기록이 없습니다.
              </p>
            )}
          </div>
          {history?.note ? (
            <p className="mb-0 mt-5 border-t border-zinc-800 pt-4 text-xs leading-relaxed text-zinc-500">
              {history.note}
            </p>
          ) : null}
        </section>
      </main>

      {isReportModalOpen && report ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 px-3 py-6 backdrop-blur-[3px] sm:px-5">
          <div
            className="flex w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-zinc-700/90 bg-zinc-950 shadow-2xl shadow-violet-950/20 ring-1 ring-violet-500/15"
            style={{ maxHeight: "min(90vh, 820px)" }}
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-zinc-800 px-4 py-4 sm:px-6">
              <div className="min-w-0">
                <p className="m-0 text-xs font-medium text-zinc-500">평가 완료</p>
                <h2 className="m-0 mt-0.5 text-lg font-semibold text-zinc-100 sm:text-xl">
                  보고서가 생성되었습니다
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsReportModalOpen(false)}
                className="shrink-0 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800"
              >
                닫기
              </button>
            </div>

            <div className="shrink-0 border-b border-zinc-800 px-4 py-3 sm:px-6">
              <p className="m-0 text-sm leading-relaxed text-zinc-400">
                현재 성능 결과는 <strong className="text-zinc-100">{healthLabels[healthStatus]}</strong>{" "}
                상태입니다.
                {healthStatus === "degraded"
                  ? " 성능 지표가 재학습 정책 기준을 넘어 재학습이 필요할 수 있습니다."
                  : " 아래 내용을 확인해 주세요."}
              </p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <div className="grid gap-4 border-b border-zinc-800 bg-zinc-900/40 px-4 py-4 sm:grid-cols-2 sm:gap-5 sm:px-6 sm:py-4">
                <div className="min-w-0">
                  <p className="m-0 mb-2 text-xs font-medium text-zinc-500">성능 추이</p>
                  <ForecastChart compact points={evaluation?.forecast_points ?? []} />
                </div>
                <div className="min-h-0 min-w-0">
                  <p className="m-0 mb-2 text-xs font-medium text-zinc-500">보고서</p>
                  <div className="modal-scroll max-h-[min(40vh,320px)] overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-950/80 p-4 sm:max-h-[min(42vh,340px)]">
                    <ReportMarkdown markdown={report.markdown} />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-zinc-800 bg-zinc-950 px-4 py-3 sm:flex-row sm:justify-end sm:gap-3 sm:px-6 sm:py-3.5">
              <button
                type="button"
                onClick={() => {
                  void handleKeepCurrentModel();
                }}
                disabled={!canRetrain || activeAction === "keep"}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-zinc-200 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                현재 모델 유지
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleRetrainRequest();
                }}
                disabled={!canRetrain || activeAction === "retrain"}
                className="w-full rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-500 sm:w-auto"
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
