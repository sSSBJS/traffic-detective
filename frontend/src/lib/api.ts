export interface UploadResponse {
  result_visualizing_LSTM: string;
  result_evaluating_LSTM: string | number;
  result_visualizing_LSTM_v2: string;
  result_evaluating_LSTM_v2: string | number;
  saved_filename: string;
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
  } catch (_error) {
    // Ignore invalid JSON responses and fall back to status text.
  }

  return response.statusText || "요청 처리 중 오류가 발생했습니다.";
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
