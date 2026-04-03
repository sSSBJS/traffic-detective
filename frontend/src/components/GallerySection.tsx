const galleryImages = Array.from({ length: 9 }, (_, index) => {
  const imageNumber = String(index + 1).padStart(2, "0");
  return {
    src: `/img/gallery-img-${imageNumber}.jpg`,
    alt: `Gallery ${imageNumber}`,
  };
});

export function GallerySection() {
  return (
    <section
      id="section-3"
      className="relative overflow-hidden"
      style={{
        backgroundImage:
          "linear-gradient(180deg, rgba(255,255,255,0.95), rgba(219,234,254,0.92)), url('/img/section-3-bg.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div className="mx-auto max-w-7xl px-6 py-20 lg:px-8">
        <div className="mb-10 flex items-end justify-between gap-6">
          <div>
            <p className="mb-2 text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
              Archive
            </p>
            <h2 className="m-0 text-3xl font-bold text-slate-950 md:text-4xl">Our Gallery</h2>
          </div>
          <p className="m-0 max-w-xl text-sm leading-7 text-slate-600">
            기존 갤러리 이미지를 유지하되, 반응형 그리드와 호버 오버레이로 정리했습니다.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {galleryImages.map((image) => (
            <figure
              key={image.src}
              className="group relative m-0 overflow-hidden rounded-[2rem] bg-slate-900 shadow-soft"
            >
              <img
                src={image.src}
                alt={image.alt}
                className="h-72 w-full object-cover transition duration-500 group-hover:scale-105 group-hover:opacity-75"
              />
              <figcaption className="pointer-events-none absolute inset-0 flex items-end bg-gradient-to-t from-slate-950/75 to-transparent p-6 opacity-100 transition">
                <div>
                  <p className="m-0 text-sm uppercase tracking-[0.25em] text-slate-200">
                    학습결과
                  </p>
                  <p className="mb-0 mt-2 text-lg font-semibold text-white">
                    예측 과정 스냅샷
                  </p>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
