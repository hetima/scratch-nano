import {
  useEffect,
  useRef,
  useCallback,
  useState,
  useMemo,
} from "react";
import { Marked } from "marked";
import { openUrl } from "@tauri-apps/plugin-opener";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { mod, shift, isMac } from "../../lib/platform";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useOptionalNotes } from "../../context/NotesContext";
import { useTheme, getFontFamilyValue } from "../../context/ThemeContext";
import { EditorWidthHandles } from "./EditorWidthHandle";
import { CodeMirrorEditor } from "./CodeMirrorEditor";
import { cn } from "../../lib/utils";
import { plainTextFromMarkdown } from "../../lib/plainText";
import { Button, IconButton, Tooltip } from "../ui";
import * as notesService from "../../services/notes";
import { downloadPdf, downloadMarkdown } from "../../services/pdf";
import type { Settings } from "../../types/note";
import {
  CircleCheckIcon,
  CopyIcon,
  DownloadIcon,
  ShareIcon,
  PanelLeftIcon,
  RefreshCwIcon,
  PinIcon,
  SearchIcon,
  MarkdownIcon,
  MarkdownOffIcon,
  FolderPlusIcon,
} from "../icons";

// Configure marked instance with GFM support + code block copy button
const COPY_SVG = '<svg class="code-copy-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M7 9.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667l0 -8.666"/><path d="M4.012 16.737a2.005 2.005 0 0 1 -1.012 -1.737v-10c0 -1.1 .9 -2 2 -2h10c.75 0 1.158 .385 1.5 1"/></svg>';
const CHECK_SVG = '<svg class="code-copy-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M5 12l5 5l10 -10"/></svg>';

const marked = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    code({ text }: { text: string }) {
      const escaped = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      return `<div class="code-block-wrapper"><button class="code-copy-btn" type="button" title="Copy">${COPY_SVG}</button><pre><code>${escaped}</code></pre></div>`;
    },
  },
});

function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Data source for preview mode — bypasses NotesContext
export interface PreviewModeData {
  content: string | null;
  title: string;
  filePath: string;
  modified: number;
  hasExternalChanges: boolean;
  reloadVersion: number;
  reload: () => Promise<void>;
}

interface EditorProps {
  onToggleSidebar?: () => void;
  sidebarVisible?: boolean;
  focusMode?: boolean;
  previewMode?: PreviewModeData;
  onSaveToFolder?: () => void;
  saveToFolderDisabled?: boolean;
}

export function Editor({
  onToggleSidebar,
  sidebarVisible,
  focusMode,
  previewMode,
  onSaveToFolder,
  saveToFolderDisabled,
}: EditorProps) {
  const notesCtx = useOptionalNotes();

  const currentNote = previewMode
    ? previewMode.content !== null
      ? {
          id: previewMode.filePath,
          title: previewMode.title,
          content: previewMode.content,
          path: previewMode.filePath,
          modified: previewMode.modified,
        }
      : null
    : (notesCtx?.currentNote ?? null);

  const createNote = notesCtx?.createNote;
  const saveNote = notesCtx?.saveNote;
  const hasExternalChanges = previewMode
    ? previewMode.hasExternalChanges
    : notesCtx!.hasExternalChanges;
  const reloadCurrentNote = previewMode
    ? previewMode.reload
    : notesCtx!.reloadCurrentNote;
  const pinNote = notesCtx?.pinNote;
  const unpinNote = notesCtx?.unpinNote;
  const notes = notesCtx?.notes;
  const { textDirection, resolvedTheme, editorFontSettings: fonts } = useTheme();
  const isDark = resolvedTheme === "dark";

  const [copyMenuOpen, setCopyMenuOpen] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [hasTransitioned, setHasTransitioned] = useState(false);

  // Source mode state
  const [sourceMode, setSourceMode] = useState(false);

  // Dirty + live content tracking for source mode
  const [isDirty, setIsDirty] = useState(false);
  const [liveContent, setLiveContent] = useState<string | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hasTransitioned && currentNote) {
      const id = requestAnimationFrame(() => setHasTransitioned(true));
      return () => cancelAnimationFrame(id);
    }
  }, [hasTransitioned, currentNote]);

  const needsSidebarDelay = focusMode && sidebarVisible;
  const isSidebarActive = sidebarVisible && !focusMode;

  // Reset state when switching notes (keep source mode, discard unsaved edits)
  useEffect(() => {
    setIsDirty(false);
    setLiveContent(null);
  }, [currentNote?.id]);

  // Clear dirty state when currentNote.content updates from context (after save)
  useEffect(() => {
    if (isDirty && liveContent === currentNote?.content) {
      setIsDirty(false);
      setLiveContent(null);
    }
  }, [currentNote?.content, isDirty, liveContent]);

  // Scroll to top when switching notes
  useEffect(() => {
    scrollContainerRef.current?.scrollTo(0, 0);
  }, [currentNote?.id]);

  // Load settings when note changes
  useEffect(() => {
    if (currentNote?.id && !previewMode) {
      notesService
        .getSettings()
        .then(setSettings)
        .catch((error) => {
          console.error("Failed to load settings:", error);
        });
    }
  }, [currentNote?.id, notes, previewMode]);

  const isPinned =
    settings?.pinnedNoteIds?.includes(currentNote?.id || "") || false;

  // Render markdown to HTML — uses liveContent in source mode for real-time preview
  const displayContent = liveContent ?? currentNote?.content;
  const renderedHtml = useMemo(() => {
    if (!displayContent) return "";
    return marked.parse(displayContent) as string;
  }, [displayContent]);

  // Copy handlers — use currentNote.content directly (no live editor state)
  const handleCopyMarkdown = useCallback(async () => {
    if (!currentNote) return;
    try {
      await invoke("copy_to_clipboard", { text: currentNote.content });
      toast.success("Copied as Markdown");
    } catch (error) {
      console.error("Failed to copy markdown:", error);
      toast.error("Failed to copy");
    }
  }, [currentNote]);

  const handleCopyPlainText = useCallback(async () => {
    if (!currentNote) return;
    try {
      const plainText = plainTextFromMarkdown(currentNote.content);
      await invoke("copy_to_clipboard", { text: plainText });
      toast.success("Copied as plain text");
    } catch (error) {
      console.error("Failed to copy plain text:", error);
      toast.error("Failed to copy");
    }
  }, [currentNote]);

  const handleCopyHtml = useCallback(async () => {
    if (!currentNote) return;
    try {
      const html = await marked.parse(currentNote.content);
      await invoke("copy_to_clipboard", { text: html as string });
      toast.success("Copied as HTML");
    } catch (error) {
      console.error("Failed to copy HTML:", error);
      toast.error("Failed to copy");
    }
  }, [currentNote]);

  // Download handlers
  const handleDownloadPdf = useCallback(async () => {
    if (!currentNote) return;
    try {
      await downloadPdf(currentNote.title);
    } catch (error) {
      console.error("Failed to open print dialog:", error);
      toast.error("Failed to open print dialog");
    }
  }, [currentNote]);

  useEffect(() => {
    const handler = () => handleDownloadPdf();
    window.addEventListener("print-note", handler);
    return () => window.removeEventListener("print-note", handler);
  }, [handleDownloadPdf]);

  const handleDownloadMarkdown = useCallback(async () => {
    if (!currentNote) return;
    try {
      const saved = await downloadMarkdown(currentNote.content, currentNote.title);
      if (saved) {
        toast.success("Markdown saved successfully");
      }
    } catch (error) {
      console.error("Failed to download markdown:", error);
      toast.error("Failed to save markdown");
    }
  }, [currentNote]);

  // Toggle source mode
  const toggleSourceMode = useCallback(() => {
    setSourceMode((prev) => !prev);
  }, []);

  // Listen for toggle-source-mode custom event
  useEffect(() => {
    const handler = () => toggleSourceMode();
    window.addEventListener("toggle-source-mode", handler);
    return () => window.removeEventListener("toggle-source-mode", handler);
  }, [toggleSourceMode]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+U / Ctrl+U to toggle source mode
      if (
        (e.metaKey || e.ctrlKey) &&
        !e.shiftKey &&
        e.key.toLowerCase() === "u"
      ) {
        if (!currentNote) return;
        const target = e.target as HTMLElement;
        if (target.tagName.toLowerCase() === "input") return;
        if (target.closest('[class*="sidebar"]')) return;
        e.preventDefault();
        toggleSourceMode();
        return;
      }

      // Cmd+F / Ctrl+F — delegate to browser find
      if (
        (e.metaKey || e.ctrlKey) &&
        !e.shiftKey &&
        e.key.toLowerCase() === "f"
      ) {
        if (!currentNote) return;
        const target = e.target as HTMLElement;
        if (
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA"
        ) {
          return;
        }
        if (target.closest('[class*="sidebar"]')) return;
        // Let the browser handle Cmd+F natively
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [currentNote, toggleSourceMode]);

  // Keyboard shortcut for Cmd+Shift+C to open copy menu
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "c") {
        e.preventDefault();
        setCopyMenuOpen(true);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Handle Cmd+Click on links in the preview
  useEffect(() => {
    const container = previewRef.current;
    if (!container) return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const link = target.closest("a");
      if (link && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        const rawHref = link.getAttribute("href") ?? "";
        if (
          rawHref.startsWith("http:") ||
          rawHref.startsWith("https:") ||
          rawHref.startsWith("mailto:")
        ) {
          openUrl(rawHref).catch((error) =>
            console.error("Failed to open link:", error),
          );
        }
      }
    };

    container.addEventListener("click", handleClick);
    return () => container.removeEventListener("click", handleClick);
  }, [renderedHtml, sourceMode]);

  if (!currentNote) {
    if (previewMode) {
      return (
        <div className="flex-1 flex flex-col bg-bg">
          <div
            className="h-10 shrink-0 flex items-end px-4 pb-1"
            data-tauri-drag-region
          ></div>
          <div className="flex-1 flex items-center justify-center">
            <p className="text-text-muted">Loading...</p>
          </div>
        </div>
      );
    }

    if (notesCtx?.selectedNoteId) {
      return (
        <div className="flex-1 flex flex-col bg-bg">
          <div
            className="h-10 shrink-0 flex items-end px-4 pb-1"
            data-tauri-drag-region
          ></div>
          <div className="flex-1 flex items-center justify-center">
            <p className="text-text-muted">Loading...</p>
          </div>
        </div>
      );
    }

    return (
      <div className="flex-1 flex flex-col bg-bg">
        <div
          className="h-10 shrink-0 flex items-end px-4 pb-1"
          data-tauri-drag-region
        ></div>
        <div className="flex-1 flex items-center justify-center pb-8">
          <div className="text-center text-text-muted select-none">
            <div
              role="img"
              aria-label="Note"
              className="w-42 aspect-square mx-auto mb-1"
              style={{
                backgroundColor: "var(--color-text)",
                WebkitMaskImage: "url(/note-dark.png)",
                WebkitMaskSize: "contain",
                WebkitMaskRepeat: "no-repeat",
                WebkitMaskPosition: "center",
                maskImage: "url(/note-dark.png)",
                maskSize: "contain",
                maskRepeat: "no-repeat",
                maskPosition: "center",
              }}
            />
            <h1 className="text-2xl text-text font-serif mb-1 tracking-[-0.01em]">
              What&apos;s on your mind?
            </h1>
            <p className="text-sm">
              Pick up where you left off, or start something new
            </p>
            {createNote && (
              <Button
                onClick={createNote}
                variant="secondary"
                size="md"
                className="mt-4"
              >
                New Note{" "}
                <span className="text-text-muted ml-1">
                  {mod}
                  {isMac ? "" : "+"}N
                </span>
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-bg overflow-hidden">
      {/* Header bar */}
      <div
        className={cn(
          "h-11 shrink-0 flex items-center justify-between px-3",
          !isSidebarActive && "pl-22",
        )}
        data-tauri-drag-region
      >
        <div
          className={`titlebar-no-drag flex items-center gap-1 min-w-0 transition-opacity duration-400 ${needsSidebarDelay ? "delay-200" : ""} ${focusMode ? "opacity-0 pointer-events-none" : "opacity-100"}`}
        >
          {onToggleSidebar && (
            <IconButton
              onClick={onToggleSidebar}
              title={
                isSidebarActive
                  ? `Hide sidebar (${mod}${isMac ? "" : "+"}\\)`
                  : `Show sidebar (${mod}${isMac ? "" : "+"}\\)`
              }
              className="shrink-0"
            >
              <PanelLeftIcon className="w-4.5 h-4.5 stroke-[1.5]" />
            </IconButton>
          )}
          <span className="text-xs text-text-muted mb-px truncate">
            {formatDateTime(currentNote.modified)}
          </span>
        </div>
        <div
          className={`titlebar-no-drag flex items-center gap-px shrink-0 transition-opacity duration-400 ${needsSidebarDelay ? "delay-200" : ""} ${focusMode ? "opacity-0 pointer-events-none" : "opacity-100"}`}
        >
          {hasExternalChanges ? (
            <Tooltip
              content={`External changes detected (${mod}${isMac ? "" : "+"}R to refresh)`}
            >
              <button
                onClick={reloadCurrentNote}
                className="h-7 px-2 flex items-center gap-1 text-xs text-text-muted hover:bg-bg-emphasis rounded transition-colors font-medium"
              >
                <RefreshCwIcon className="w-4 h-4 stroke-[1.6]" />
                <span>Refresh</span>
              </button>
            </Tooltip>
          ) : isDirty ? (
            <Tooltip content={`Save changes (${mod}${isMac ? "" : "+"}S)`}>
              <button
                onClick={() => {
                  // Read current content from CodeMirror and save
                  if (saveNote && liveContent != null) {
                    saveNote(liveContent, currentNote.id);
                    setIsDirty(false);
                  }
                }}
                className="h-7 w-7 flex items-center justify-center rounded-full hover:bg-bg-emphasis transition-colors"
              >
                <CircleCheckIcon className="w-4.5 h-4.5 mt-px stroke-[1.5] text-text" />
              </button>
            </Tooltip>
          ) : (
            <Tooltip content={sourceMode ? "Editing" : "Read-only preview"}>
              <div className="h-7 w-7 flex items-center justify-center rounded-full">
                <CircleCheckIcon
                  className={cn(
                    "w-4.5 h-4.5 mt-px stroke-[1.5]",
                    sourceMode ? "text-text-muted/70" : "text-text-muted/40",
                  )}
                />
              </div>
            </Tooltip>
          )}
          {currentNote && pinNote && unpinNote && (
            <Tooltip content={isPinned ? "Unpin note" : "Pin note"}>
              <IconButton
                onClick={async () => {
                  if (!currentNote) return;
                  try {
                    if (isPinned) {
                      await unpinNote(currentNote.id);
                      toast.success("Note unpinned");
                    } else {
                      await pinNote(currentNote.id);
                      toast.success("Note pinned");
                    }
                    const updatedSettings = await notesService.getSettings();
                    setSettings(updatedSettings);
                  } catch (error) {
                    console.error("Failed to pin/unpin note:", error);
                    toast.error(
                      `Failed to ${isPinned ? "unpin" : "pin"} note: ${
                        error instanceof Error ? error.message : "Unknown error"
                      }`,
                    );
                  }
                }}
              >
                <PinIcon
                  className={cn(
                    "w-5 h-5 stroke-[1.3]",
                    isPinned && "fill-current",
                  )}
                />
              </IconButton>
            </Tooltip>
          )}
          {currentNote && (
            <Tooltip content={`Find in note (${mod}${isMac ? "" : "+"}F)`}>
              <IconButton onClick={() => { /* browser Find handles this */ }}>
                <SearchIcon className="w-4.25 h-4.25 stroke-[1.6]" />
              </IconButton>
            </Tooltip>
          )}
          {currentNote && (
            <Tooltip
              content={
                sourceMode
                  ? `View Formatted (${mod}${isMac ? "" : "+"}${shift}${isMac ? "" : "+"}M)`
                  : `View Markdown Source (${mod}${isMac ? "" : "+"}${shift}${isMac ? "" : "+"}M)`
              }
            >
              <IconButton onClick={toggleSourceMode}>
                {sourceMode ? (
                  <MarkdownOffIcon className="w-4.75 h-4.75 stroke-[1.4]" />
                ) : (
                  <MarkdownIcon className="w-4.75 h-4.75 stroke-[1.4]" />
                )}
              </IconButton>
            </Tooltip>
          )}
          <DropdownMenu.Root
            open={copyMenuOpen}
            onOpenChange={setCopyMenuOpen}
          >
            <Tooltip
              content={`Export (${mod}${isMac ? "" : "+"}${shift}${isMac ? "" : "+"}C)`}
            >
              <DropdownMenu.Trigger asChild>
                <IconButton>
                  <ShareIcon className="w-4.25 h-4.25 stroke-[1.6]" />
                </IconButton>
              </DropdownMenu.Trigger>
            </Tooltip>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className="min-w-35 bg-bg border border-border rounded-md shadow-lg py-1 z-50"
                sideOffset={5}
                align="end"
                onCloseAutoFocus={(e) => e.preventDefault()}
                onKeyDown={(e) => {
                  if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                    e.stopPropagation();
                  }
                }}
              >
                <DropdownMenu.Item
                  className="px-3 py-1.5 text-sm text-text cursor-pointer outline-none hover:bg-bg-muted focus:bg-bg-muted flex items-center gap-2"
                  onSelect={handleCopyMarkdown}
                >
                  <CopyIcon className="w-4 h-4 stroke-[1.6]" />
                  Copy Markdown
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className="px-3 py-1.5 text-sm text-text cursor-pointer outline-none hover:bg-bg-muted focus:bg-bg-muted flex items-center gap-2"
                  onSelect={handleCopyPlainText}
                >
                  <CopyIcon className="w-4 h-4 stroke-[1.6]" />
                  Copy Plain Text
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className="px-3 py-1.5 text-sm text-text cursor-pointer outline-none hover:bg-bg-muted focus:bg-bg-muted flex items-center gap-2"
                  onSelect={handleCopyHtml}
                >
                  <CopyIcon className="w-4 h-4 stroke-[1.6]" />
                  Copy HTML
                </DropdownMenu.Item>
                <DropdownMenu.Separator className="h-px bg-border my-1" />
                <DropdownMenu.Item
                  className="px-3 py-1.5 text-sm text-text cursor-pointer outline-none hover:bg-bg-muted focus:bg-bg-muted flex items-center gap-2"
                  onSelect={handleDownloadPdf}
                >
                  <DownloadIcon className="w-4 h-4 stroke-[1.6]" />
                  Print as PDF
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className="px-3 py-1.5 text-sm text-text cursor-pointer outline-none hover:bg-bg-muted focus:bg-bg-muted flex items-center gap-2"
                  onSelect={handleDownloadMarkdown}
                >
                  <DownloadIcon className="w-4 h-4 stroke-[1.6]" />
                  Export Markdown
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
          {onSaveToFolder && (
            <Tooltip content="Save in Folder">
              <IconButton
                onClick={onSaveToFolder}
                aria-label="Save in Folder"
                disabled={saveToFolderDisabled}
              >
                {saveToFolderDisabled ? (
                  <span className="text-text-muted">...</span>
                ) : (
                  <FolderPlusIcon className="w-4.25 h-4.25 stroke-[1.6]" />
                )}
              </IconButton>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Content area — preview or source mode */}
      <div
        data-editor-content-area
        className="flex-1 relative overflow-hidden"
      >
        {!focusMode && !sourceMode && (
          <EditorWidthHandles containerRef={scrollContainerRef} />
        )}
        <div
          data-editor-scroll
          ref={scrollContainerRef}
          className="absolute inset-0 overflow-y-auto overflow-x-hidden"
          dir={textDirection}
        >
          {/* Markdown preview */}
          {!sourceMode && (
            <div
              ref={previewRef}
              className="markdown-preview prose px-6 pt-8 pb-24 mx-auto"
              style={{
                maxWidth: "var(--editor-max-width, 48rem)",
                fontFamily: "var(--editor-font-family)",
                fontSize: "var(--editor-base-font-size)",
                lineHeight: "var(--editor-line-height)",
              }}
              dangerouslySetInnerHTML={{ __html: renderedHtml }}
              onClick={(e) => {
                const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(".code-copy-btn");
                if (!btn) return;
                const code = btn.parentElement?.querySelector("code");
                if (!code) return;
                invoke("copy_to_clipboard", { text: code.textContent ?? "" })
                  .then(() => {
                    btn.classList.add("copied");
                    btn.innerHTML = CHECK_SVG;
                    setTimeout(() => {
                      btn.classList.remove("copied");
                      btn.innerHTML = COPY_SVG;
                    }, 1500);
                  })
                  .catch((err) => console.error("Failed to copy:", err));
              }}
            />
          )}
          {/* Source mode — CodeMirror editor */}
          {sourceMode && (
            <div className="absolute inset-0" dir={textDirection}>
              <CodeMirrorEditor
                content={currentNote.content}
                onSave={(newContent) => {
                  if (saveNote) {
                    saveNote(newContent, currentNote.id);
                  }
                  setIsDirty(false);
                  // liveContent will sync when currentNote updates from context
                }}
                onChange={(newContent) => {
                  setLiveContent(newContent);
                  setIsDirty(true);
                }}
                fontFamily={getFontFamilyValue(fonts.editFontFamily)}
                fontSize={fonts.editFontSize}
                lineHeight={fonts.editLineHeight}
                codeFontFamily={getFontFamilyValue(fonts.codeFontFamily)}
                textDirection={textDirection}
                isDark={isDark}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
