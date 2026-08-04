import { convertFileSrc } from "@tauri-apps/api/core";

export function getMediaSrc(path: string | undefined | null): string {
  if (!path) return "";
  
  if (
    path.startsWith("blob:") ||
    path.startsWith("data:") ||
    path.startsWith("http://") ||
    path.startsWith("https://")
  ) {
    return path;
  }

  try {
    return convertFileSrc(path);
  } catch (err) {
    console.warn("convertFileSrc fallback to path:", err);
    return path;
  }
}
