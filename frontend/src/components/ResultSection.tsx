import type { UploadResponse } from "../lib/api";

interface ResultSectionProps {
  uploadResult: UploadResponse | null;
  isDownloading: boolean;
  downloadError: string | null;
  onDownload: () => Promise<void>;
}

const resultCards = [
  {
    imageKey: "result_visualizing_LSTM" as const,
    scoreKey: "result_evaluating_LSTM" as const,
    title: "LSTM Result",
  },
  {
    imageKey: "result_visualizing_LSTM_v2" as const,
    scoreKey: "result_evaluating_LSTM_v2" as const,
    title: "LSTM Result V2",
  },
];

export function ResultSection({
  uploadResult,
  isDownloading,
  downloadError,
  onDownload,
}: ResultSectionProps) {
  return (
    <section id="section-4" className="mx-auto max-w-7xl px-6 py-20 lg:px-8">
      <div className="mb-10 flex items-end justify-between gap-6">
        <div>
          <p className="mb-2 text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
            Output
          </p>
          <h2 className="m-0 text-3xl font-bold text-slate-950 md:text-4xl">Trained Image</h2>
        </div>

        <button
          type="button"
          onClick={() => {
            void onDownload();
          }}
          disabled={!uploadResult || isDownloading}
          className="rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {isDownloading ? "다운로드 중..." : "대표 이미지 다운로드"}
        </button>
      </div>

      {downloadError ? (
        <p className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {downloadError}
        </p>
      ) : null}

      {!uploadResult ? (
        <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white/70 px-6 py-16 text-center text-slate-500">
          업로드를 완료하면 예측 이미지와 평가 결과가 여기에 표시됩니다.
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {resultCards.map((card) => (
            <article
              key={card.title}
              className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-soft"
            >
              <img
                src={uploadResult[card.imageKey]}
                alt={card.title}
                className="h-[22rem] w-full object-cover"
              />
              <div className="space-y-2 p-6">
                <p className="mb-1 text-sm font-semibold uppercase tracking-[0.25em] text-sea">
                  Prediction
                </p>
                <h3 className="m-0 text-2xl font-bold text-slate-900">{card.title}</h3>
                <p className="m-0 text-sm text-slate-500">
                  저장 파일명: {uploadResult.saved_filename}
                </p>
                <p className="mb-0 mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  평가 결과: {String(uploadResult[card.scoreKey])}
                </p>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
