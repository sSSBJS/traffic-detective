import type { ChangeEvent, FormEvent } from "react";

interface HeroUploadSectionProps {
  file: File | null;
  isUploading: boolean;
  uploadError: string | null;
  uploadMessage: string | null;
  onFileChange: (file: File | null) => void;
  onSubmit: () => Promise<void>;
}

export function HeroUploadSection({
  file,
  isUploading,
  uploadError,
  uploadMessage,
  onFileChange,
  onSubmit,
}: HeroUploadSectionProps) {
  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0] ?? null;
    onFileChange(nextFile);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit();
  }

  return (
    <section
      id="section-1"
      className="relative overflow-hidden"
      style={{
        backgroundImage:
          "linear-gradient(135deg, rgba(15, 23, 42, 0.82), rgba(8, 47, 73, 0.65)), url('/img/bg_2.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div className="mx-auto grid max-w-7xl gap-12 px-6 py-20 lg:grid-cols-[1.2fr_0.8fr] lg:px-8 lg:py-24">
        <div className="text-white">
          <p className="mb-4 inline-flex rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium uppercase tracking-[0.3em]">
            Model Serving
          </p>
          <h1 className="m-0 max-w-3xl text-4xl font-bold leading-tight md:text-6xl">
            AI 서비스를 위한 모델 서빙을 React 기반 UI로 재구성했습니다.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-100">
            기존 프로젝트의 업로드, 예측 결과 확인, 이미지 다운로드 흐름을 유지하면서
            프론트엔드를 React, Vite, TypeScript, Tailwind로 옮겼습니다.
          </p>
        </div>

        <div className="rounded-[2rem] border border-white/15 bg-white/12 p-6 text-white shadow-soft backdrop-blur-xl">
          <h2 className="mt-0 text-2xl font-bold">CSV 업로드</h2>
          <p className="mb-6 text-sm text-slate-200">
            학습 데이터 CSV를 업로드하면 두 개의 LSTM 결과 이미지를 바로 확인할 수
            있습니다.
          </p>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="block rounded-3xl border border-dashed border-white/30 bg-slate-950/20 p-5 text-sm">
              <span className="mb-3 block font-medium text-slate-50">파일 선택</span>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileChange}
                className="block w-full text-sm text-slate-200 file:mr-4 file:rounded-full file:border-0 file:bg-white file:px-4 file:py-2 file:font-medium file:text-slate-900 hover:file:bg-slate-100"
              />
            </label>

            <div className="rounded-2xl bg-white/10 px-4 py-3 text-sm text-slate-100">
              {file ? `${file.name} 선택됨` : "아직 선택된 파일이 없습니다."}
            </div>

            {uploadError ? (
              <p className="m-0 rounded-2xl border border-rose-300/50 bg-rose-500/20 px-4 py-3 text-sm text-rose-50">
                {uploadError}
              </p>
            ) : null}

            {uploadMessage ? (
              <p className="m-0 rounded-2xl border border-emerald-300/40 bg-emerald-500/20 px-4 py-3 text-sm text-emerald-50">
                {uploadMessage}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={isUploading}
              className="w-full rounded-full bg-white px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:bg-white/50"
            >
              {isUploading ? "업로드 중..." : "업로드 시작"}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
