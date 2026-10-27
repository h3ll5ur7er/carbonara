// Exporting a picture of the factory: what the file is called, and handing it to the browser as a download.
// The picture itself comes from the canvas (canvasActions().image).

/** "Motor factory.png"; characters file systems refuse become dashes. */
export function imageFileName(documentName: string, format: "png" | "svg"): string {
  const name = documentName.trim().replace(/[\\/:*?"<>|]+/g, "-") || "factory";
  return `${name}.${format}`;
}

/** Saves a data URL as a file. */
export function download(url: string, fileName: string): void {
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
}
