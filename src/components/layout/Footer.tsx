import { memo } from "react";
import { IconButton } from "../ui";
import { SettingsIcon } from "../icons";
import { mod, isMac } from "../../lib/platform";

interface FooterProps {
  onOpenSettings?: () => void;
}

export const Footer = memo(function Footer({ onOpenSettings }: FooterProps) {
  return (
    <div className="absolute bottom-3 right-3">
      <IconButton
        onClick={onOpenSettings}
        title={`Settings (${mod}${isMac ? "" : "+"}, to toggle)`}
        className="rounded-lg bg-bg-secondary border border-border hover:bg-bg-muted backdrop-blur-sm w-8 h-8"
      >
        <SettingsIcon className="w-4.5 h-4.5 stroke-[1.5]" />
      </IconButton>
    </div>
  );
});
