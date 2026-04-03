import { useState } from "react";
import { GallerySection } from "./components/GallerySection";
import { HeaderNav } from "./components/HeaderNav";
import { HeroUploadSection } from "./components/HeroUploadSection";
import { ResultSection } from "./components/ResultSection";
import { WorkSection } from "./components/WorkSection";
import { downloadResultImage, type UploadResponse, uploadDataset } from "./lib/api";

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] = useState<UploadResponse | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  function handleFileChange(nextFile: File | null) {
    setFile(nextFile);
    setUploadError(null);
    setUploadMessage(null);
  }

  async function handleUpload() {
    setUploadError(null);
    setUploadMessage(null);
    setDownloadError(null);

    if (!file) {
      setUploadError("업로드할 CSV 파일을 선택해주세요.");
      return;
    }

    const isCsv =
      file.type === "text/csv" ||
      file.name.toLowerCase().endsWith(".csv") ||
      file.type === "application/vnd.ms-excel";

    if (!isCsv) {
      setUploadError("CSV 형식의 파일만 업로드할 수 있습니다.");
      return;
    }

    setIsUploading(true);

    try {
      const response = await uploadDataset(file);
      setUploadResult(response);
      setUploadMessage("업로드와 예측이 완료되었습니다.");
    } catch (error) {
      setUploadError(
        error instanceof Error ? error.message : "업로드 처리 중 오류가 발생했습니다.",
      );
    } finally {
      setIsUploading(false);
    }
  }

  async function handleDownload() {
    setDownloadError(null);

    if (!uploadResult) {
      setDownloadError("먼저 업로드를 완료해 주세요.");
      return;
    }

    setIsDownloading(true);

    try {
      const blob = await downloadResultImage();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = "stock.png";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      setDownloadError(
        error instanceof Error ? error.message : "다운로드 처리 중 오류가 발생했습니다.",
      );
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <div className="min-h-screen">
      <HeaderNav />
      <HeroUploadSection
        file={file}
        isUploading={isUploading}
        uploadError={uploadError}
        uploadMessage={uploadMessage}
        onFileChange={handleFileChange}
        onSubmit={handleUpload}
      />
      <WorkSection />
      <GallerySection />
      <ResultSection
        uploadResult={uploadResult}
        isDownloading={isDownloading}
        downloadError={downloadError}
        onDownload={handleDownload}
      />
    </div>
  );
}
