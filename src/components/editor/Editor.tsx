import {
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  useState,
} from "react";
import { Crepe } from "@milkdown/crepe";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import type { Editor as MilkdownEditor } from "@milkdown/kit/core";
import { editorViewCtx, parserCtx } from "@milkdown/kit/core";
import { Slice } from "@milkdown/kit/prose/model";
import type { EditorView } from "@milkdown/kit/prose/view";
import { TextSelection } from "@milkdown/kit/prose/state";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/nord.css";

import { getCurrentWindow } from '@tauri-apps/api/window';
import type { UnlistenFn } from '@tauri-apps/api/event'; 
import { Menu, MenuItem, PredefinedMenuItem } from "@tauri-apps/api/menu";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import { toast } from "sonner";
import { mod, alt, shift, isMac } from "../../lib/platform";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useOptionalNotes } from "../../context/NotesContext";
import { useTheme } from "../../context/ThemeContext";
import { SearchToolbar } from "./SearchToolbar";
import { EditorWidthHandles } from "./EditorWidthHandle";
import { cn } from "../../lib/utils";
import { plainTextFromMarkdown } from "../../lib/plainText";
import { Button, IconButton, Tooltip } from "../ui";
import * as notesService from "../../services/notes";
import { downloadPdf, downloadMarkdown } from "../../services/pdf";
import type { Settings } from "../../types/note";
import {
  SpinnerIcon,
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

/**
 * Get character offsets where each top-level block starts in markdown.
 */
function getMarkdownBlockOffsets(md: string): number[] {
  const offsets: number[] = [];
  const lines = md.split("\n");
  let pos = 0;
  let prevBlank = true;
  let inCodeFence = false;

  for (const line of lines) {
    const trimmed = line.trimStart();

    if (inCodeFence) {
      if (trimmed.startsWith("```")) {
        inCodeFence = false;
      }
    } else if (trimmed.startsWith("```")) {
      offsets.push(pos);
      inCodeFence = true;
      prevBlank = false;
    } else {
      const isBlank = trimmed === "";
      if (!isBlank && (prevBlank || trimmed.startsWith("#"))) {
        offsets.push(pos);
      }
      prevBlank = isBlank;
    }

    pos += line.length + 1;
  }

  return offsets;
}

/** ProseMirror position at the start of the Nth top-level block. */
function blockIndexToPos(
  doc: { childCount: number; child: (i: number) => { nodeSize: number } },
  blockIndex: number,
): number {
  const idx = Math.max(0, Math.min(blockIndex, doc.childCount - 1));
  let pos = 1;
  for (let i = 0; i < idx; i++) {
    pos += doc.child(i).nodeSize;
  }
  return pos;
}

/** Replace all editor content with new markdown via ProseMirror dispatch. */
function replaceContent(editor: MilkdownEditor, markdown: string) {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const parser = ctx.get(parserCtx);
    const doc = parser(markdown);
    if (!doc) return;
    const state = view.state;
    view.dispatch(
      state.tr.replace(
        0,
        state.doc.content.size,
        new Slice(doc.content, 0, 0),
      ),
    );
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
  save: (content: string) => Promise<void>;
  reload: () => Promise<void>;
}

interface EditorProps {
  onToggleSidebar?: () => void;
  sidebarVisible?: boolean;
  focusMode?: boolean;
  previewMode?: PreviewModeData;
  onEditorReady?: (crepe: Crepe | null) => void;
  onSaveToFolder?: () => void;
  saveToFolderDisabled?: boolean;
}

export function Editor({
  onToggleSidebar,
  sidebarVisible,
  focusMode,
  onEditorReady,
  previewMode,
  onSaveToFolder,
  saveToFolderDisabled,
}: EditorProps) {
  return (
    <MilkdownProvider>
      <MilkdownEditorInner
        onToggleSidebar={onToggleSidebar}
        sidebarVisible={sidebarVisible}
        focusMode={focusMode}
        onEditorReady={onEditorReady}
        previewMode={previewMode}
        onSaveToFolder={onSaveToFolder}
        saveToFolderDisabled={saveToFolderDisabled}
      />
    </MilkdownProvider>
  );
}

function MilkdownEditorInner({
  onToggleSidebar,
  sidebarVisible,
  focusMode,
  onEditorReady,
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

  const saveNote = previewMode
    ? async (content: string, _noteId?: string) => {
        await previewMode.save(content);
      }
    : notesCtx!.saveNote;

  const createNote = notesCtx?.createNote;
  const consumePendingNewNote = notesCtx?.consumePendingNewNote;
  const hasExternalChanges = previewMode
    ? previewMode.hasExternalChanges
    : notesCtx!.hasExternalChanges;
  const reloadCurrentNote = previewMode
    ? previewMode.reload
    : notesCtx!.reloadCurrentNote;
  const reloadVersion = previewMode
    ? previewMode.reloadVersion
    : notesCtx!.reloadVersion;
  const pinNote = notesCtx?.pinNote;
  const unpinNote = notesCtx?.unpinNote;
  const notes = notesCtx?.notes;
  const { textDirection } = useTheme();

  const [isSaving, setIsSaving] = useState(false);
  const [copyMenuOpen, setCopyMenuOpen] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [hasTransitioned, setHasTransitioned] = useState(false);

  useEffect(() => {
    if (!hasTransitioned && currentNote) {
      const id = requestAnimationFrame(() => setHasTransitioned(true));
      return () => cancelAnimationFrame(id);
    }
  }, [hasTransitioned, currentNote]);

  const needsSidebarDelay = focusMode && sidebarVisible;
  const isSidebarActive = sidebarVisible && !focusMode;

  // Source mode state
  const [sourceMode, setSourceMode] = useState(false);
  const [sourceContent, setSourceContent] = useState("");
  const sourceModeTransitionRef = useRef<{
    topBlockIndex: number;
    cursorBlockIndex: number;
    md?: string;
  } | null>(null);

  // Search state
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const isLoadingRef = useRef(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const currentNoteIdRef = useRef<string | null>(null);
  const notesCtxRef = useRef(notesCtx);
  notesCtxRef.current = notesCtx;

  currentNoteIdRef.current = currentNote?.id ?? null;

  // Crepe ref to access the Crepe instance
  const crepeRef = useRef<Crepe | null>(null);
  // Milkdown editor ref
  const editorRef = useRef<MilkdownEditor | null>(null);

  // Use Milkdown's useEditor hook
  const { loading, get: getEditor } = useEditor((root) => {
    const crepe = new Crepe({
      root,
      defaultValue: "# Welcome",
      features: {
        [Crepe.Feature.Cursor]: true,
        [Crepe.Feature.ListItem]: true,
        [Crepe.Feature.ImageBlock]: true,
        [Crepe.Feature.CodeMirror]: true,
        [Crepe.Feature.Table]: true,
        [Crepe.Feature.TopBar]: true,
        [Crepe.Feature.Toolbar]: false,
        [Crepe.Feature.Placeholder]: false,
        [Crepe.Feature.BlockEdit]: false,
        [Crepe.Feature.LinkTooltip]: false,
        [Crepe.Feature.Latex]: false,
        [Crepe.Feature.AI]: false,
      },
      featureConfigs: {
        
      },
    });

    crepeRef.current = crepe;
    return crepe;
  });

  // Keep editorRef in sync with the Milkdown editor instance
  useEffect(() => {
    const editor = getEditor();
    if (editor) {
      editorRef.current = editor;
      onEditorReady?.(crepeRef.current);
    }
  }, [loading, getEditor, onEditorReady]);

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

  // Immediate save function
  const saveImmediately = useCallback(async () => {
      const noteId = loadedNoteIdRef.current;
      if (!noteId || !crepeRef.current) return;
      const content = crepeRef.current.getMarkdown();
      if (lastSaveRef.current?.noteId === noteId && lastSaveRef.current.content === content) return;
      setIsSaving(true);
      try {
        lastSaveRef.current = { noteId, content };
        await saveNote(content, noteId);
      } finally {
        setIsSaving(false);
      }
    },
    [saveNote],
  );

  // Handle window close to save pending changes
  useEffect(() => {
    const appWindow = getCurrentWindow();
    let unlisten: UnlistenFn | undefined;
    
    appWindow.onCloseRequested(async (event) => {
      event.preventDefault();
      try {
        if (loadedNoteIdRef.current) {
          await saveImmediately();
        }
      } catch (e) {
        console.error('Save failed before closing:', e);
      }
      unlisten?.();
      await appWindow.destroy();
    }).then((fn) => { unlisten = fn; })
      .catch((e) => console.error("Failed to setup close listener:", e));
    
    return () => {
      unlisten?.();
    };
  }, [saveImmediately]);

  // Track which note is loaded
  const loadedNoteIdRef = useRef<string | null>(null);
  const loadedModifiedRef = useRef<number | null>(null);
  const lastSaveRef = useRef<{ noteId: string; content: string } | null>(null);
  const lastReloadVersionRef = useRef(0);

  // Search navigation
  const openEditorSearch = useCallback(() => {
    setSearchOpen(true);
    requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
  }, []);

  // Clear search on note switch
  useEffect(() => {
    if (currentNote?.id) {
      setSearchOpen(false);
      setSearchQuery("");
    }
  }, [currentNote?.id]);

  // Load note content when the current note changes
  useEffect(() => {
    if (!currentNote || loading) return;
    const editor = getEditor();
    if (!editor) return;

    const isSameNote = currentNote.id === loadedNoteIdRef.current;

    // Detect rename
    if (!isSameNote) {
      const lastSave = lastSaveRef.current;
      if (
        lastSave?.noteId === loadedNoteIdRef.current &&
        lastSave?.content === currentNote.content
      ) {
        loadedNoteIdRef.current = currentNote.id;
        loadedModifiedRef.current = currentNote.modified;
        lastSaveRef.current = null;
        // Save pending changes on rename
        if (loadedNoteIdRef.current) {
          saveImmediately();
        }
        return;
      }
    }

    // Save current note immediately before switching
    if (!isSameNote && loadedNoteIdRef.current) {
      console.log("Saved note %s before switching", loadedNoteIdRef.current);
      saveImmediately();
    }

    // Reset source mode when switching notes
    if (!isSameNote) {
      setSourceMode(false);
    }

    const isManualReload = reloadVersion !== lastReloadVersionRef.current;

    if (isSameNote) {
      if (isManualReload) {
        lastReloadVersionRef.current = reloadVersion;
        loadedModifiedRef.current = currentNote.modified;
        isLoadingRef.current = true;
        replaceContent(editor, currentNote.content);
        isLoadingRef.current = false;
        return;
      }
      loadedModifiedRef.current = currentNote.modified;
      return;
    }

    const isNewNote = loadedNoteIdRef.current === null;
    const wasEmpty = !isNewNote && currentNote.content?.trim() === "";
    const loadingNoteId = currentNote.id;

    loadedNoteIdRef.current = loadingNoteId;
    loadedModifiedRef.current = currentNote.modified;

    isLoadingRef.current = true;

    replaceContent(editor, currentNote.content);

    // Record loaded content so flushAndSave can skip if nothing changed
    lastSaveRef.current = { noteId: loadingNoteId, content: currentNote.content };

    scrollContainerRef.current?.scrollTo(0, 0);

    requestAnimationFrame(() => {
      if (loadedNoteIdRef.current !== loadingNoteId) return;
      scrollContainerRef.current?.scrollTo(0, 0);
      isLoadingRef.current = false;

      if (consumePendingNewNote?.(loadingNoteId)) {
        return;
      }

      if ((isNewNote || wasEmpty) && currentNote.content.trim() === "") {
        const noteListFocused =
          document.activeElement?.closest("[data-note-list]");
        if (!noteListFocused) {
          // Focus editor
        }
      }
    });
  }, [
    currentNote,
    loading,
    getEditor,
    saveImmediately,
    reloadVersion,
    consumePendingNewNote,
  ]);

  // Scroll to top on mount
  useEffect(() => {
    scrollContainerRef.current?.scrollTo(0, 0);
  }, []);

  // Cleanup on unmount — save immediately if there are unsaved changes
  useEffect(() => {
    return () => {
      if (loadedNoteIdRef.current && crepeRef.current) {
        saveImmediately();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveImmediately]);

  // Copy handlers
  const handleCopyMarkdown = useCallback(async () => {
    if (!crepeRef.current) return;
    try {
      const markdown = crepeRef.current.getMarkdown();
      await invoke("copy_to_clipboard", { text: markdown });
      toast.success("Copied as Markdown");
    } catch (error) {
      console.error("Failed to copy markdown:", error);
      toast.error("Failed to copy");
    }
  }, []);

  const handleCopyPlainText = useCallback(async () => {
    if (!crepeRef.current) return;
    try {
      const markdown = crepeRef.current.getMarkdown();
      const plainText = plainTextFromMarkdown(markdown);
      await invoke("copy_to_clipboard", { text: plainText });
      toast.success("Copied as plain text");
    } catch (error) {
      console.error("Failed to copy plain text:", error);
      toast.error("Failed to copy");
    }
  }, []);

  const handleCopyHtml = useCallback(async () => {
    const editor = getEditor();
    if (!editor) return;
    try {
      const view = editor.ctx.get(editorViewCtx);
      const div = document.createElement("div");
      div.innerHTML = view.dom.innerHTML;
      const html = div.innerHTML;
      await invoke("copy_to_clipboard", { text: html });
      toast.success("Copied as HTML");
    } catch (error) {
      console.error("Failed to copy HTML:", error);
      toast.error("Failed to copy");
    }
  }, [getEditor]);

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
    if (!crepeRef.current || !currentNote) return;
    try {
      const markdown = crepeRef.current.getMarkdown();
      const saved = await downloadMarkdown(markdown, currentNote.title);
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
    const editor = getEditor();
    if (!editor) return;
    const container = scrollContainerRef.current;
    const view = editor.ctx.get(editorViewCtx);

    if (!sourceMode) {
      const md = crepeRef.current?.getMarkdown() ?? "";

      let topBlockIndex = 0;
      if (container) {
        const rect = container.getBoundingClientRect();
        try {
          const topPos = view.posAtCoords({
            left: rect.left + rect.width / 2,
            top: rect.top + 10,
          });
          if (topPos) {
            const resolved = view.state.doc.resolve(
              Math.min(topPos.pos, view.state.doc.content.size),
            );
            topBlockIndex = resolved.index(0);
          }
        } catch {
          // posAtCoords can fail at edges
        }
      }

      let cursorBlockIndex = 0;
      try {
        const { from } = view.state.selection;
        const resolved = view.state.doc.resolve(
          Math.min(from, view.state.doc.content.size),
        );
        cursorBlockIndex = resolved.index(0);
      } catch {
        // resolve can fail at edges
      }

      sourceModeTransitionRef.current = {
        topBlockIndex,
        cursorBlockIndex,
        md,
      };
      setSourceContent(md);
      setSourceMode(true);
    } else {
      const textarea = container?.querySelector(
        "textarea",
      ) as HTMLTextAreaElement | null;

      let topBlockIndex = 0;
      let cursorBlockIndex = 0;
      if (textarea) {
        const blockOffsets = getMarkdownBlockOffsets(sourceContent);
        const lineHeight =
          parseFloat(getComputedStyle(textarea).lineHeight) || 20;
        const topLine = Math.floor(textarea.scrollTop / lineHeight);
        const lines = sourceContent.split("\n");
        let charOffset = 0;
        for (let i = 0; i < Math.min(topLine, lines.length); i++) {
          charOffset += lines[i].length + 1;
        }
        for (let i = 0; i < blockOffsets.length; i++) {
          if (blockOffsets[i] <= charOffset) topBlockIndex = i;
          if (blockOffsets[i] <= textarea.selectionStart) cursorBlockIndex = i;
        }
      }

      sourceModeTransitionRef.current = { topBlockIndex, cursorBlockIndex };

      replaceContent(editor, sourceContent);
      setSourceMode(false);
    }
  }, [getEditor, sourceMode, sourceContent]);

  // Restore scroll position after source mode transitions
  useLayoutEffect(() => {
    let rafId: number | undefined;
    const transition = sourceModeTransitionRef.current;
    if (!transition) {
      return () => {};
    }
    sourceModeTransitionRef.current = null;

    const container = scrollContainerRef.current;

    if (sourceMode) {
      const textarea = container?.querySelector(
        "textarea",
      ) as HTMLTextAreaElement | null;
      if (!textarea) return () => {};

      const md = transition.md || "";
      const blockOffsets = getMarkdownBlockOffsets(md);
      const cursorPos =
        transition.cursorBlockIndex < blockOffsets.length
          ? blockOffsets[transition.cursorBlockIndex]
          : md.length;
      textarea.setSelectionRange(cursorPos, cursorPos);
      textarea.focus();

      if (transition.topBlockIndex < blockOffsets.length) {
        const charOffset = blockOffsets[transition.topBlockIndex];
        const linesBefore = md.slice(0, charOffset).split("\n").length - 1;
        const lineHeight =
          parseFloat(getComputedStyle(textarea).lineHeight) || 20;
        textarea.scrollTop = linesBefore * lineHeight;
      }
    } else {
      const editor = getEditor();
      if (editor) {
        const view = editor.ctx.get(editorViewCtx);
        rafId = requestAnimationFrame(() => {
          if (!view?.dom?.isConnected) return;
          const doc = view.state.doc;
          const pos = blockIndexToPos(doc, transition.cursorBlockIndex);
          try {
            view.focus();
            const tr = view.state.tr.setSelection(
              TextSelection.create(view.state.doc, pos, pos),
            );
            view.dispatch(tr);
          } catch {
            // ignore
          }

          const el = scrollContainerRef.current;
          if (el) {
            try {
              el.scrollTop = 0;
              const coords = view.coordsAtPos(
                blockIndexToPos(doc, transition.topBlockIndex),
              );
              const containerRect = el.getBoundingClientRect();
              el.scrollTop = coords.top - containerRect.top;
            } catch {
              // coordsAtPos can fail
            }
          }
        });
      }
    }

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [sourceMode, getEditor]);

  // Listen for toggle-source-mode custom event
  useEffect(() => {
    const handler = () => toggleSourceMode();
    window.addEventListener("toggle-source-mode", handler);
    return () => window.removeEventListener("toggle-source-mode", handler);
  }, [toggleSourceMode]);

  // Cmd+S to save, Cmd+U to toggle source mode, Cmd+F to open search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+S / Ctrl+S to save
      if (
        (e.metaKey || e.ctrlKey) &&
        !e.shiftKey &&
        e.key.toLowerCase() === "s"
      ) {
        if (!loadedNoteIdRef.current || !crepeRef.current) return;
        e.preventDefault();
        saveImmediately();
        toast.success("Saved");
        return;
      }

      // Cmd+U / Ctrl+U to toggle source mode
      if (
        (e.metaKey || e.ctrlKey) &&
        !e.shiftKey &&
        e.key.toLowerCase() === "u"
      ) {
        if (!currentNote || loading) return;
        const target = e.target as HTMLElement;
        const tagName = target.tagName.toLowerCase();
        if (tagName === "input") {
          return;
        }
        if (target.closest('[class*="sidebar"]')) {
          return;
        }
        e.preventDefault();
        toggleSourceMode();
        return;
      }

      // Cmd+F / Ctrl+F to open search
      if (
        (e.metaKey || e.ctrlKey) &&
        !e.shiftKey &&
        e.key.toLowerCase() === "f"
      ) {
        if (!currentNote || loading) return;
        const target = e.target as HTMLElement;
        const tagName = target.tagName.toLowerCase();
        if (
          (tagName === "input" || tagName === "textarea") &&
          !target.closest(".milkdown")
        ) {
          return;
        }
        if (target.closest('[class*="sidebar"]')) {
          return;
        }
        e.preventDefault();
        openEditorSearch();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [loading, currentNote, openEditorSearch, saveImmediately, toggleSourceMode]);

  // Auto-save in source mode
  const handleSourceChange = useCallback((value: string) => {
    setSourceContent(value);
  }, []);

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

  // Handle clicks on external links
  useEffect(() => {
    const editor = getEditor();
    if (!editor) return;
    const view = editor.ctx.get(editorViewCtx);

    const handleEditorClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const link = target.closest("a");
      if (link) {
        e.preventDefault();
        if ((e.metaKey || e.ctrlKey) && link.href) {
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
      }
    };

    const editorElement = view.dom;
    editorElement.addEventListener("click", handleEditorClick);
    return () => {
      editorElement.removeEventListener("click", handleEditorClick);
    };
  }, [loading, getEditor]);

  if (!currentNote) {
    if (previewMode) {
      return (
        <div className="flex-1 flex flex-col bg-bg">
          <div
            className="h-10 shrink-0 flex items-end px-4 pb-1"
            data-tauri-drag-region
          ></div>
          <div className="flex-1 flex items-center justify-center">
            <SpinnerIcon className="w-6 h-6 text-text-muted animate-spin" />
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
            <SpinnerIcon className="w-6 h-6 text-text-muted animate-spin" />
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
          ) : isSaving ? (
            <Tooltip content="Saving...">
              <div className="h-7 w-7 flex items-center justify-center">
                <SpinnerIcon className="w-4.5 h-4.5 text-text-muted/40 stroke-[1.5] animate-spin" />
              </div>
            </Tooltip>
          ) : (
            <Tooltip content="All changes saved">
              <div className="h-7 w-7 flex items-center justify-center rounded-full">
                <CircleCheckIcon className="w-4.5 h-4.5 mt-px stroke-[1.5] text-text-muted/40" />
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
              <IconButton onClick={openEditorSearch}>
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
                  <SpinnerIcon className="w-4.25 h-4.25 animate-spin" />
                ) : (
                  <FolderPlusIcon className="w-4.25 h-4.25 stroke-[1.6]" />
                )}
              </IconButton>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Editor content area */}
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
          {searchOpen && !sourceMode && (
            <div className="sticky top-2 z-10 animate-in fade-in slide-in-from-top-4 duration-200 pointer-events-none pr-2 flex justify-end">
              <div className="pointer-events-auto">
                <SearchToolbar
                  inputRef={searchInputRef}
                  query={searchQuery}
                  onChange={setSearchQuery}
                  onNext={() => {}}
                  onPrevious={() => {}}
                  onClose={() => {
                    setSearchOpen(false);
                    setSearchQuery("");
                    const editor = getEditor();
                    if (editor) {
                      const view = editor.ctx.get(editorViewCtx);
                      view.focus();
                    }
                  }}
                  currentMatch={0}
                  totalMatches={0}
                />
              </div>
            </div>
          )}
          <div
            className="h-full"
            style={sourceMode ? { display: "none" } : undefined}
          >
            <Milkdown />
          </div>
          {sourceMode && (
            <div className="h-full absolute inset-0">
              <textarea
                value={sourceContent}
                onChange={(e) => handleSourceChange(e.target.value)}
                wrap="off"
                dir={textDirection}
                className="w-full h-full bg-transparent text-text focus:outline-none resize-none px-6 pt-8 pb-24 mx-auto block"
                style={{
                  maxWidth: "var(--editor-max-width, 48rem)",
                  fontFamily:
                    "ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Monaco, 'Courier New', monospace",
                  fontSize: "0.875em",
                  lineHeight: "var(--editor-line-height)",
                  tabSize: 2,
                }}
                spellCheck={false}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
