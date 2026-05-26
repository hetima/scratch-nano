import { useState, useEffect } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { showUpdateToast } from "../../App";
import { Button } from "../ui";
import { RefreshCwIcon, SpinnerIcon, GithubIcon, FolderIcon, SearchIcon } from "../icons";

export function AboutSettingsSection() {
  const [appVersion, setAppVersion] = useState<string>("");
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [rebuildingIndex, setRebuildingIndex] = useState(false);

  useEffect(() => {
    getVersion()
      .then(setAppVersion)
      .catch(() => {});
  }, []);

  const handleCheckForUpdates = async () => {
    setCheckingUpdate(true);
    const result = await showUpdateToast();
    setCheckingUpdate(false);
    if (result === "no-update") {
      toast.success("You're on the latest version!");
    } else if (result === "error") {
      toast.error("Could not check for updates. Try again later.");
    }
  };

  const handleRebuildIndex = async () => {
    setRebuildingIndex(true);
    try {
      await invoke("rebuild_search_index");
      toast.success("Search index rebuilt successfully.");
    } catch (err) {
      toast.error("Failed to rebuild search index.");
    } finally {
      setRebuildingIndex(false);
    }
  };

  const handleOpenUrl = async (url: string) => {
    try {
      await invoke("open_url_safe", { url });
    } catch (err) {
      console.error("Failed to open URL:", err);
      toast.error(err instanceof Error ? err.message : "Failed to open URL");
    }
  };

  return (
    <div className="space-y-8 py-8">
      {/* Version */}
      <section className="pb-2">
        <h2 className="text-xl font-medium mb-0.5">Version</h2>
        <p className="text-sm text-text-muted mb-4">
          You are currently using Scratch Nano v{appVersion || "..."}
        </p>
        <Button
          onClick={handleCheckForUpdates}
          disabled={checkingUpdate}
          variant="outline"
          size="md"
          className="gap-1.25"
        >
          {checkingUpdate ? (
            <>
              <SpinnerIcon className="w-4.5 h-4.5 stroke-[1.5] animate-spin" />
              Checking...
            </>
          ) : (
            <>
              <RefreshCwIcon className="w-4.5 h-4.5 stroke-[1.5]" />
              Check for Updates
            </>
          )}
        </Button>
      </section>

      {/* Divider */}
      <div className="border-t border-border border-dashed" />

      {/* Maintenance */}
      <section className="pb-2">
        <h2 className="text-xl font-medium mb-0.5">Maintenance</h2>
        <p className="text-sm text-text-muted mb-4">
          Open the folder containing settings and data files.
        </p>
        <div className="flex items-center gap-1">
          <Button
            onClick={async () => {
              try {
                const dir = await invoke<string>("get_app_data_dir");
                await invoke("open_in_file_manager", { path: dir });
              } catch (err) {
                toast.error("Failed to open data directory");
              }
            }}
            variant="outline"
            size="md"
            className="gap-1.25"
          >
            <FolderIcon className="w-4.5 h-4.5 stroke-[1.5]" />
            Open Data Directory
          </Button>
          <Button
            onClick={handleRebuildIndex}
            disabled={rebuildingIndex}
            variant="outline"
            size="md"
            className="gap-1.25"
          >
            {rebuildingIndex ? (
              <>
                <SpinnerIcon className="w-4.5 h-4.5 stroke-[1.5] animate-spin" />
                Rebuilding...
              </>
            ) : (
              <>
                <SearchIcon className="w-4.5 h-4.5 stroke-[1.5]" />
                Rebuild Search Index
              </>
            )}
          </Button>
        </div>
      </section>

      {/* Divider */}
      <div className="border-t border-border border-dashed" />

      {/* About Section */}
      <section className="pb-2">
        <h2 className="text-xl font-medium mb-1">About Scratch Nano</h2>
        <p className="text-sm text-text-muted mb-4">
          Scratch Nano is a super minimal markdown scratchpad for capturing quick
          thoughts, todos, and ideas. Based on{" "}
          <button
            onClick={() => handleOpenUrl("https://www.ericli.io/scratch")}
            className="text-text-muted border-b border-text-muted/50 hover:text-text hover:border-text cursor-pointer transition-colors"
          >
            Scratch
          </button>
          , inspired by{" "}
          <button
            onClick={() => handleOpenUrl("https://notational.net/")}
            className="text-text-muted border-b border-text-muted/50 hover:text-text hover:border-text cursor-pointer transition-colors"
          >
            Notational Velocity
          </button>
          {" "}and{" "}
          <button
            onClick={() => handleOpenUrl("https://brettterpstra.com/projects/nvalt/")}
            className="text-text-muted border-b border-text-muted/50 hover:text-text hover:border-text cursor-pointer transition-colors"
          >
            nvALT
          </button>
          .
        </p>

        <div className="flex items-center gap-1">
          <Button
            onClick={() => handleOpenUrl("https://github.com/hetima/scratch-nano")}
            variant="outline"
            size="md"
            className="gap-1.25"
          >
            <GithubIcon className="w-4.5 h-4.5 stroke-[1.5]" />
            View on GitHub
          </Button>
          <Button
            onClick={() =>
              handleOpenUrl("https://github.com/hetima/scratch-nano/issues")
            }
            variant="ghost"
            size="md"
            className="gap-1.25 text-text"
          >
            Submit Feedback
          </Button>
        </div>
      </section>
    </div>
  );
}
