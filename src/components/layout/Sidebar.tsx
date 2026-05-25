import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useNotes } from "../../context/NotesContext";
import { NoteList } from "../notes/NoteList";
import { Footer } from "./Footer";
import { IconButton, Input } from "../ui";
import {
  PlusIcon,
  XIcon,
  NoteIcon,
} from "../icons";
import * as notesService from "../../services/notes";
import { FolderNameDialog } from "../notes/FolderNameDialog";
import { Tooltip } from "../ui/Tooltip";

interface SidebarProps {
  onOpenSettings?: () => void;
}

export function Sidebar({ onOpenSettings }: SidebarProps) {
  const {
    createNoteWithName,
    createFolder,
    addNotesFolder,
    notes,
    search,
    searchQuery,
    searchResults,
    clearSearch,
    selectedNoteId,
    selectNote,
    moveNote,
    moveFolder,
    notesFolders,
    notesFolder,
    switchNotesFolder,
  } = useNotes();
  const [inputValue, setInputValue] = useState(searchQuery);

  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [folderDialogParent, setFolderDialogParent] = useState("");
  const [foldersEnabled, setFoldersEnabled] = useState(true);
  const [dragLabel, setDragLabel] = useState<string | null>(null);
  const [dragCount, setDragCount] = useState(1);
  const [multiSelectedNoteIds, setMultiSelectedNoteIds] = useState<Set<string>>(new Set());
  const debounceRef = useRef<number | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const multiSelectedRef = useRef(multiSelectedNoteIds) as RefObject<Set<string>>;
  multiSelectedRef.current = multiSelectedNoteIds;

  // dnd-kit
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current;
    if (data?.type === "note") {
      const noteId = data.id as string;
      const leaf = noteId.includes("/")
        ? noteId.substring(noteId.lastIndexOf("/") + 1)
        : noteId;
      setDragLabel(leaf);

      // Multi-select: if dragged note is in selection, drag all; otherwise reset
      const selected = multiSelectedRef.current!;
      if (selected.has(noteId) && selected.size > 1) {
        setDragCount(selected.size);
      } else {
        setMultiSelectedNoteIds(new Set([noteId]));
        setDragCount(1);
      }
    } else if (data?.type === "folder") {
      const path = data.path as string;
      const name = path.includes("/")
        ? path.substring(path.lastIndexOf("/") + 1)
        : path;
      setDragLabel(name);
      setDragCount(1);
    }
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setDragLabel(null);
      setDragCount(1);
      const { active, over } = event;
      if (!over) return;

      const activeData = active.data.current;
      const overData = over.data.current;
      if (!activeData || !overData) return;

      const targetFolder = overData.path as string;

      try {
        if (activeData.type === "note") {
          const noteId = activeData.id as string;
          const selected = multiSelectedRef.current!;

          // Batch move if multi-selected
          if (selected.has(noteId) && selected.size > 1) {
            const noteIds = Array.from(selected).filter((id) => {
              const parent = id.includes("/")
                ? id.substring(0, id.lastIndexOf("/"))
                : "";
              return parent !== targetFolder;
            });
            if (noteIds.length === 0) return;
            let failures = 0;
            for (const id of noteIds) {
              try {
                await moveNote(id, targetFolder);
              } catch {
                failures++;
              }
            }
            if (failures > 0) {
              toast.error(`Failed to move ${failures} note(s)`);
            }
            setMultiSelectedNoteIds(new Set());
          } else {
            const noteParent = noteId.includes("/")
              ? noteId.substring(0, noteId.lastIndexOf("/"))
              : "";
            if (noteParent === targetFolder) return;
            await moveNote(noteId, targetFolder);
            setMultiSelectedNoteIds(new Set());
          }
        } else if (activeData.type === "folder") {
          const folderPath = activeData.path as string;
          if (
            targetFolder === folderPath ||
            targetFolder.startsWith(folderPath + "/")
          )
            return;
          const folderParent = folderPath.includes("/")
            ? folderPath.substring(0, folderPath.lastIndexOf("/"))
            : "";
          if (folderParent === targetFolder) return;
          await moveFolder(folderPath, targetFolder);
        }

        // Expand target folder so the moved item is visible
        if (targetFolder) {
          window.dispatchEvent(
            new CustomEvent("expand-folder", { detail: targetFolder }),
          );
        }
      } catch (error) {
        console.error("Failed to move item:", error);
        toast.error("Failed to move item");
      }
    },
    [moveNote, moveFolder],
  );

  // Load folders setting
  useEffect(() => {
    notesService.getSettings().then((s) => {
      setFoldersEnabled(s.foldersEnabled === true);
    }).catch((error) => {
      console.error("Failed to load settings:", error);
      setFoldersEnabled(false);
    });
  }, []);

  // Sync input with search query
  useEffect(() => {
    setInputValue(searchQuery);
  }, [searchQuery]);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setInputValue(value);

      // Debounce search
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      debounceRef.current = window.setTimeout(() => {
        search(value);
      }, 220);
    },
    [search],
  );





  // Global shortcut hook: focus sidebar search
  useEffect(() => {
    const handleOpenSidebarSearch = () => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    };

    window.addEventListener("open-sidebar-search", handleOpenSidebarSearch);
    return () =>
      window.removeEventListener(
        "open-sidebar-search",
        handleOpenSidebarSearch,
      );
  }, []);

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (inputValue) {
          setInputValue("");
          clearSearch();
        }
      } else if (e.key === "Enter" && inputValue.trim()) {
        e.preventDefault();
        void createNoteWithName(inputValue.trim());
        setInputValue("");
        clearSearch();
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        // TODO: folder tree view has its own display order (hierarchy) that differs from
        // the notes array (date order), so arrow navigation is disabled when the tree is
        // visible. To support it, FolderTreeView would need to expose its visible node
        // order via a ref or callback.
        if (foldersEnabled && !searchQuery.trim()) return;
        e.preventDefault();
        const displayItems = searchQuery.trim()
          ? searchResults
          : notes;
        if (displayItems.length === 0) return;
        const currentIndex = selectedNoteId
          ? displayItems.findIndex((item) => item.id === selectedNoteId)
          : -1;
        let nextIndex: number;
        if (e.key === "ArrowDown") {
          nextIndex = currentIndex < displayItems.length - 1 ? currentIndex + 1 : currentIndex;
        } else {
          nextIndex = currentIndex > 0 ? currentIndex - 1 : 0;
        }
        if (nextIndex !== currentIndex) {
          selectNote(displayItems[nextIndex].id);
        }
      }
    },
    [inputValue, clearSearch, createNoteWithName, searchQuery, searchResults, notes, selectedNoteId, selectNote],
  );

  const handleClearSearch = useCallback(() => {
    setInputValue("");
    clearSearch();
  }, [clearSearch]);

  const handleAddFolder = useCallback(async () => {
    try {
      const selected = await invoke<string | null>("open_folder_dialog", { defaultPath: null });
      if (selected) {
        await addNotesFolder(selected);
      }
    } catch (err) {
      console.error("Failed to select folder:", err);
      toast.error("Failed to select folder");
    }
  }, [addNotesFolder]);

  const handleFolderDialogConfirm = useCallback(
    async (name: string) => {
      try {
        await createFolder(folderDialogParent, name);
        setFolderDialogOpen(false);
      } catch (error) {
        console.error("Failed to create folder:", error);
        toast.error("Failed to create folder");
      }
    },
    [createFolder, folderDialogParent],
  );

  // Listen for create-new-folder event (from command palette / keyboard shortcut)
  useEffect(() => {
    const handleCreateFolder = () => {
      // Derive parent folder from currently selected note
      const lastSlash = selectedNoteId?.lastIndexOf("/") ?? -1;
      setFolderDialogParent(
        lastSlash > 0 ? selectedNoteId!.substring(0, lastSlash) : "",
      );
      setFolderDialogOpen(true);
    };

    window.addEventListener("create-new-folder", handleCreateFolder);
    return () =>
      window.removeEventListener("create-new-folder", handleCreateFolder);
  }, [selectedNoteId]);

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDragLabel(null)}
    >
    <div className="relative w-full h-full bg-bg-secondary border-r border-border flex flex-col select-none">
      {/* Header row with drag region */}
      <div className="h-11 shrink-0 flex items-center justify-between pl-4 pr-3" data-tauri-drag-region>
        <div className="flex items-center gap-1 min-w-0 flex-1">
          {notesFolders.length > 1 ? (
            <FolderSelector
              folders={notesFolders}
              activeFolder={notesFolder}
              onSwitch={switchNotesFolder}
            />
          ) : (
            <>
              <div className="font-medium text-base">Notes</div>
              <div className="text-text-muted font-medium text-2xs min-w-4.75 h-4.75 flex items-center justify-center px-1 bg-bg-muted rounded-sm mt-0.5 pt-px">
                {notes.length}
              </div>
            </>
          )}
        </div>
        <div className="flex items-center gap-px titlebar-no-drag">
          <IconButton
            variant="ghost"
            onClick={handleAddFolder}
            title="Add Folder"
          >
            <PlusIcon className="w-5.25 h-5.25 stroke-[1.4]" />
          </IconButton>
        </div>
      </div>
      {/* Search - always visible */}
      <div className="px-2 pt-0.5 pb-1.5 border-b border-border shrink-0">
        <div className="relative">
          <Input
            ref={searchInputRef}
            type="text"
            value={inputValue}
            onChange={handleSearchChange}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search notes or Create new..."
            className="h-8 pr-8 text-sm"
          />
          {inputValue && (
            <button
              onClick={handleClearSearch}
              tabIndex={-1}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text"
            >
              <XIcon className="w-4.5 h-4.5 stroke-[1.5]" />
            </button>
          )}
        </div>
      </div>

      {/* Scrollable notes area */}
      <div className="flex-1 overflow-y-auto">
        <NoteList
          multiSelectedNoteIds={multiSelectedNoteIds}
          setMultiSelectedNoteIds={setMultiSelectedNoteIds}
        />
      </div>

      {/* Footer with settings */}
      <Footer onOpenSettings={onOpenSettings} />

      {/* Folder name dialog */}
      <FolderNameDialog
        open={folderDialogOpen}
        onOpenChange={setFolderDialogOpen}
        onConfirm={handleFolderDialogConfirm}
        title="Create new folder"
        description="Enter a name for your new folder"
        confirmLabel="Create"
      />
    </div>

    {/* Drag overlay — floating label while dragging */}
    <DragOverlay dropAnimation={null}>
      {dragLabel && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-bg border border-border rounded-md shadow-lg text-sm text-text">
          <NoteIcon className="w-3.5 h-3.5 stroke-[1.6] opacity-50 shrink-0" />
          {dragLabel}
          {dragCount > 1 && (
            <span className="ml-1 px-1.5 py-0.5 bg-accent text-text-inverse text-xs rounded-full leading-none">
              +{dragCount - 1}
            </span>
          )}
        </div>
      )}
    </DragOverlay>
    </DndContext>
  );
}

function folderName(path: string): string {
  const last = path.replace(/[/\\]+$/, "").split(/[/\\]/).pop();
  return last || path;
}

function FolderSelector({
  folders,
  activeFolder,
  onSwitch,
}: {
  folders: string[];
  activeFolder: string | null;
  onSwitch: (path: string) => void;
}) {
  return (
    <DropdownMenu.Root>
      <Tooltip content={activeFolder ?? undefined} side="bottom">
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className="flex items-center gap-1 font-medium text-base text-text hover:text-text-muted truncate max-w-44 titlebar-no-drag cursor-pointer"
          >
            <span className="truncate">{activeFolder ? folderName(activeFolder) : "Notes"}</span>
            <svg className="w-3.5 h-3.5 shrink-0 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </DropdownMenu.Trigger>
      </Tooltip>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="min-w-44 bg-bg border border-border rounded-md shadow-lg py-1 z-50"
          sideOffset={5}
          align="start"
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          {folders.map((folder) => (
            <DropdownMenu.Item
              key={folder}
              className="px-3 py-1.5 text-sm cursor-pointer outline-none hover:bg-bg-muted focus:bg-bg-muted flex items-center gap-2 truncate"
              onSelect={() => onSwitch(folder)}
            >
              {activeFolder === folder && (
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
              <span className={`truncate${activeFolder === folder ? "" : " pl-5"}`}>{folderName(folder)}</span>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
