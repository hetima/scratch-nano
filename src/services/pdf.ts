import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";

/**
 * Triggers the native print dialog for the editor content.
 * Users can save as PDF or print to a physical printer.
 * Uses the browser's native print functionality which produces high-quality PDFs.
 *
 * @param _noteTitle - The note title (currently unused, but kept for API consistency)
 */
export async function downloadPdf(
  _noteTitle: string
): Promise<void> {
  window.print();
}

/**
 * Downloads the markdown content as a .md file.
 *
 * @param markdown - The markdown content to save
 * @param noteId - The note ID (relative path without extension) for the default filename
 * @returns Promise<boolean> - Returns true if file was saved successfully, false if user cancelled
 */
export async function downloadMarkdown(
  markdown: string,
  noteId: string
): Promise<boolean> {
  const stem = noteId.includes("/")
    ? noteId.substring(noteId.lastIndexOf("/") + 1)
    : noteId;
  const filePath = await save({
    defaultPath: `${stem}.md`,
    filters: [{ name: "Markdown", extensions: ["md"] }],
  });

  if (!filePath) return false; // User cancelled

  // Convert string to bytes and write file using Tauri command
  const encoder = new TextEncoder();
  const uint8Array = encoder.encode(markdown);
  await invoke("write_file", {
    path: filePath,
    contents: Array.from(uint8Array)
  });

  return true;
}

