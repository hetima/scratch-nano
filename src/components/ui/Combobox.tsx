import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type InputHTMLAttributes,
} from "react";
import { cn } from "../../lib/utils";
import { ChevronDownIcon } from "../icons";

export type ComboboxOption =
  | { value: string; label: string; separator?: false }
  | { separator: true };

export interface ComboboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> {
  value: string;
  onChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
}

export function Combobox({
  value,
  onChange,
  options,
  placeholder = "Search...",
  className,
  ...inputProps
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const displayValue =
    options.find((o): o is Extract<ComboboxOption, { value: string }> => !o.separator && o.value === value)?.label ?? value;

  // Selectable items only (no separators), filtered by query
  const selectableOptions = options.filter(
    (o): o is Extract<ComboboxOption, { value: string }> => !o.separator,
  );
  const filtered = query
    ? selectableOptions.filter((o) =>
        o.label.toLowerCase().includes(query.toLowerCase()),
      )
    : selectableOptions;

  // When searching, render only matching items (no separators)
  // When not searching, render full list with separators preserved
  const displayList: ComboboxOption[] = query ? filtered : options;

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightIndex >= 0 && listRef.current) {
      const el = listRef.current.querySelector<HTMLElement>(`[data-index="${highlightIndex}"]`);
      el?.scrollIntoView({ block: "nearest" });
    }
  }, [highlightIndex]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Reset highlight when filtered list changes
  useEffect(() => {
    setHighlightIndex(-1);
  }, [query]);

  const selectOption = useCallback(
    (val: string) => {
      onChange(val);
      setOpen(false);
      setQuery("");
    },
    [onChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!open) {
        if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setOpen(true);
        }
        return;
      }

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setHighlightIndex((i) =>
            i < filtered.length - 1 ? i + 1 : 0,
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setHighlightIndex((i) =>
            i > 0 ? i - 1 : filtered.length - 1,
          );
          break;
        case "Enter":
          e.preventDefault();
          if (highlightIndex >= 0 && filtered[highlightIndex]) {
            selectOption(filtered[highlightIndex].value);
          } else if (filtered.length > 0) {
            selectOption(filtered[0].value);
          }
          break;
        case "Escape":
          e.preventDefault();
          setOpen(false);
          setQuery("");
          break;
        case "Tab":
          setOpen(false);
          setQuery("");
          break;
      }
    },
    [open, filtered, highlightIndex, selectOption],
  );

  // Map selectable item value to its flat index in `filtered`
  const getFilteredIndex = (val: string) => filtered.findIndex((o) => o.value === val);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          autoComplete="off"
          value={open ? query : displayValue}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            setOpen(true);
            setQuery("");
          }}
          onClick={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={cn(
            "flex h-9 w-full items-center rounded-md border border-border bg-bg px-3 py-2 text-sm text-text",
            "placeholder:text-text-muted",
            "focus-visible:outline-none focus-visible:border-accent",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "pr-8",
            (inputProps as Record<string, unknown>).className as string | undefined,
          )}
        />
        <ChevronDownIcon
          className={cn(
            "absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 stroke-[1.7] text-text-muted pointer-events-none transition-transform",
            open && "rotate-180",
          )}
        />
      </div>

      {open && filtered.length > 0 && (
        <div
          ref={listRef}
          role="listbox"
          className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-border bg-bg py-1 shadow-lg"
        >
          {displayList.map((opt, i) => {
            if (opt.separator) {
              return <div key={`sep-${i}`} className="my-1 border-t border-border" />;
            }
            const fi = getFilteredIndex(opt.value);
            const isSelected = opt.value === value;
            return (
              <div
                key={opt.value}
                role="option"
                aria-selected={isSelected}
                data-index={fi}
                className={cn(
                  "flex items-center px-3 py-1.5 text-sm cursor-pointer",
                  fi === highlightIndex && "bg-bg-muted",
                  isSelected && "font-medium",
                )}
                onMouseEnter={() => setHighlightIndex(fi)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectOption(opt.value);
                }}
              >
                <span className="truncate">{opt.label}</span>
              </div>
            );
          })}
        </div>
      )}

      {open && filtered.length === 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-bg py-6 text-center text-sm text-text-muted shadow-lg">
          No matches
        </div>
      )}
    </div>
  );
}
