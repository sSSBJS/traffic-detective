const workItems = [
  {
    title: ".01 데이터 수집 및 사용자",
    description:
      "사용자 주변의 환경을 센싱하여 비콘과 RSSI 신호를 이용한 위치 기반 데이터 및 시각 데이터를 수집합니다.",
  },
  {
    title: ".02 행동패턴 예측 및 분류",
    description:
      "수집된 데이터를 머신 러닝 알고리즘을 통해 예측하고 의미있는 형태로 분류해 맞춤형 지원을 제공합니다.",
  },
  {
    title: ".03 관리자 대시보드",
    description:
      "실시간 데이터를 시각적으로 제공하고 긴급 상황 발생 시 알림을 수신할 수 있는 기능을 제공합니다.",
  },
];

export function WorkSection() {
  return (
    <section id="section-2" className="mx-auto max-w-7xl px-6 py-20 lg:px-8">
      <div className="mb-10 flex items-end justify-between gap-6">
        <div>
          <p className="mb-2 text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
            Process
          </p>
          <h2 className="m-0 text-3xl font-bold text-slate-950 md:text-4xl">Our Work</h2>
        </div>
        <p className="m-0 max-w-xl text-sm leading-7 text-slate-600">
          기존 랜딩 페이지의 정보 구조를 유지하면서 카드 형태로 다시 구성했습니다.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {workItems.map((item) => (
          <article
            key={item.title}
            className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-soft"
          >
            <p className="mb-4 text-sm font-semibold uppercase tracking-[0.24em] text-sea">
              Workflow
            </p>
            <h3 className="m-0 text-2xl font-bold text-slate-900">{item.title}</h3>
            <p className="mb-0 mt-5 text-base leading-7 text-slate-600">{item.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
