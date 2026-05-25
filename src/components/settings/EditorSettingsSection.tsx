import { useTheme, defaultThemeColors, getFontFamilyValue } from "../../context/ThemeContext";
import { Button, CodeCopyButton, IconButton, Input, Select } from "../ui";
import { Combobox } from "../ui/Combobox";
import { ColorPicker } from "../ui/ColorPicker";
import type {
  FontFamily,
  TextDirection,
  EditorWidth,
  ThemeColorKey,
} from "../../types/note";
import { ChevronRightIcon, EyeIcon, MinusIcon, PlusIcon } from "../icons";
import { cn } from "../../lib/utils";
import { getSystemFonts } from "tauri-plugin-system-fonts-api";
import { useState, useEffect, useMemo, useCallback } from "react";

// Human-readable labels for theme color keys, grouped logically
const colorLabels: { key: ThemeColorKey; label: string; group: string }[] = [
  // Surfaces
  { key: "bg", label: "Background", group: "Surfaces" },
  { key: "bg-secondary", label: "Sidebar", group: "Surfaces" },
  { key: "bg-muted", label: "Hover & Subtle Fill", group: "Surfaces" },
  { key: "bg-emphasis", label: "Strong Fill", group: "Surfaces" },
  // Text & UI
  { key: "text", label: "Text", group: "Text & UI" },
  { key: "text-muted", label: "Secondary Text", group: "Text & UI" },
  { key: "accent", label: "Primary & Buttons", group: "Text & UI" },
  { key: "border", label: "Borders", group: "Text & UI" },
  { key: "selection", label: "Selection Highlight", group: "Text & UI" },
];

// Text direction options
const textDirectionOptions: { value: TextDirection; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "ltr", label: "LTR" },
  { value: "rtl", label: "RTL" },
];

// Page width options
const editorWidthOptions: { value: EditorWidth; label: string }[] = [
  { value: "narrow", label: "Narrow" },
  { value: "normal", label: "Normal" },
  { value: "wide", label: "Wide" },
  { value: "full", label: "Full" },
  { value: "custom", label: "Custom" },
];

// Bold weight options (medium excluded for monospace)
const boldWeightOptions = [
  { value: 500, label: "Medium", excludeForMonospace: true },
  { value: 600, label: "Semibold", excludeForMonospace: false },
  { value: 700, label: "Bold", excludeForMonospace: false },
  { value: 800, label: "Extra Bold", excludeForMonospace: false },
];

/** Numeric input that defers validation to blur, allowing free-form editing in between. */
function DeferredNumericInput({
  value,
  min,
  max,
  step,
  onBlur,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onBlur: (raw: string) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const [focused, setFocused] = useState(false);

  // Sync draft when the upstream value changes (e.g. after clamp) and field is not focused
  useEffect(() => {
    if (!focused) setDraft(String(value));
  }, [value, focused]);

  return (
    <Input
      type="number"
      min={min}
      max={max}
      step={step}
      value={focused ? draft : value}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={() => {
        setFocused(true);
        setDraft(String(value));
      }}
      onBlur={() => {
        setFocused(false);
        onBlur(draft);
      }}
      className="w-full h-9 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
    />
  );
}

export function AppearanceSettingsSection() {
  const [systemFonts, setSystemFonts] = useState<string[]>([]);

  useEffect(() => {
    getSystemFonts()
      .then((fonts) => {
        const uniqueNames = [...new Set(fonts.map((f) => f.name))];
        setSystemFonts(uniqueNames);
      })
      .catch((err) => {
        console.error("Failed to load system fonts:", err);
      });
  }, []);

  const {
    theme,
    resolvedTheme,
    setTheme,
    editorFontSettings,
    setEditorFontSetting,
    resetEditorFontSettings,
    textDirection,
    setTextDirection,
    editorWidth,
    setEditorWidth,
    interfaceZoom,
    setInterfaceZoom,
    customEditorWidthPx,
    setCustomEditorWidthPx,
    customColorsLight,
    customColorsDark,
    setCustomColor,
    resetCustomColor,
    resetAllCustomColors,
  } = useTheme();

  // Build font options for combobox
  const fontOptions = useMemo(() => {
    const builtin = [
      { value: "system-sans", label: "System Sans" },
      { value: "serif", label: "Serif" },
      { value: "monospace", label: "Monospace" },
    ];
    const current = editorFontSettings.baseFontFamily;
    const isBuiltin =
      current === "system-sans" || current === "serif" || current === "monospace";
    const system = systemFonts.map((name) => ({ value: name, label: name, group: "System Fonts" }));
    // Ensure current custom font is in the list
    if (!isBuiltin && !systemFonts.includes(current)) {
      system.unshift({ value: current, label: current, group: "System Fonts" });
    }
    return [...builtin, ...system];
  }, [systemFonts, editorFontSettings.baseFontFamily]);

  // Numeric input blur handler — validates and saves only when editing is done
  const handleNumericBlur = useCallback(
    (field: "baseFontSize" | "lineHeight" | "editFontSize" | "editLineHeight", min: number, max: number, raw: string) => {
      const parsed = parseFloat(raw);
      if (!Number.isFinite(parsed)) return; // revert via controlled value
      const clamped = Math.min(Math.max(parsed, min), max);
      setEditorFontSetting(field, clamped);
    },
    [setEditorFontSetting],
  );

  // Check if any appearance settings differ from defaults
  const hasCustomAppearance =
    editorFontSettings.baseFontFamily !== "system-sans" ||
    editorFontSettings.baseFontSize !== 15 ||
    editorFontSettings.boldWeight !== 600 ||
    editorFontSettings.lineHeight !== 1.6 ||
    editorFontSettings.editFontFamily !== "system-sans" ||
    editorFontSettings.editFontSize !== 15 ||
    editorFontSettings.editLineHeight !== 1.6 ||
    editorFontSettings.codeFontFamily !== "monospace" ||
    textDirection !== "auto" ||
    editorWidth !== "normal" ||
    Math.round(interfaceZoom * 100) !== 100;

  // Filter weight options based on font family
  const isMonospace = editorFontSettings.baseFontFamily === "monospace";
  const availableWeightOptions = boldWeightOptions.filter(
    (opt) => !isMonospace || !opt.excludeForMonospace,
  );

  // Handle font family change - bump up weight if needed
  const handleFontFamilyChange = (newFamily: FontFamily) => {
    setEditorFontSetting("baseFontFamily", newFamily);
    // If switching to monospace and current weight is medium, bump to semibold
    if (newFamily === "monospace" && editorFontSettings.boldWeight === 500) {
      setEditorFontSetting("boldWeight", 600);
    }
  };

  return (
    <div className="space-y-8 py-8">
      {/* Theme Section */}
      <section className="pb-2">
        <h2 className="text-xl font-medium mb-3">Theme</h2>
        <div className="flex gap-2 p-1 rounded-[10px] border border-border">
          {(["light", "dark", "system"] as const).map((mode) => (
            <Button
              key={mode}
              onClick={() => setTheme(mode)}
              variant={theme === mode ? "primary" : "ghost"}
              size="md"
              className="flex-1"
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </Button>
          ))}
        </div>
        {theme === "system" && (
          <p className="mt-3 text-sm text-text-muted">
            Currently using {resolvedTheme} mode based on system preference
          </p>
        )}

        {/* Customize Colors */}
        {theme === "system" ? (
          <div className="mt-4 space-y-2">
            <ColorsExpandable
              label="Customize light colors"
              mode="light"
              customColors={customColorsLight}
              setCustomColor={setCustomColor}
              resetCustomColor={resetCustomColor}
              resetAllCustomColors={resetAllCustomColors}
            />
            <ColorsExpandable
              label="Customize dark colors"
              mode="dark"
              customColors={customColorsDark}
              setCustomColor={setCustomColor}
              resetCustomColor={resetCustomColor}
              resetAllCustomColors={resetAllCustomColors}
            />
          </div>
        ) : (
          <ColorsExpandable
            label="Customize colors"
            mode={resolvedTheme}
            customColors={
              resolvedTheme === "dark" ? customColorsDark : customColorsLight
            }
            setCustomColor={setCustomColor}
            resetCustomColor={resetCustomColor}
            resetAllCustomColors={resetAllCustomColors}
            className="mt-4"
          />
        )}
      </section>

      {/* Divider */}
      <div className="border-t border-border border-dashed" />

      {/* Layout Section */}
      <section>
        <h2 className="text-xl font-medium mb-3">Layout</h2>
        <div className="rounded-[10px] border border-border pl-4 py-3 pr-3 space-y-2">
          {/* Interface Zoom */}
          <div className="flex items-center justify-between">
            <label className="text-sm text-text font-medium">
              Interface Zoom
            </label>
            <div className="flex items-center gap-1 w-40">
              <IconButton
                variant="outline"
                size="md"
                onClick={() => setInterfaceZoom((prev) => prev - 0.05)}
                disabled={interfaceZoom <= 0.7}
                title="Zoom out"
              >
                <MinusIcon className="w-4 h-4" />
              </IconButton>
              <span className="text-sm font-medium tabular-nums flex-1 text-center">
                {Math.round(interfaceZoom * 100)}%
              </span>
              <IconButton
                variant="outline"
                size="md"
                onClick={() => setInterfaceZoom((prev) => prev + 0.05)}
                disabled={interfaceZoom >= 1.5}
                title="Zoom in"
              >
                <PlusIcon className="w-4 h-4" />
              </IconButton>
            </div>
          </div>

          {/* Text Direction */}
          <div className="flex items-center justify-between">
            <label className="text-sm text-text font-medium">
              Text Direction
            </label>
            <Select
              value={textDirection}
              onChange={(e) =>
                setTextDirection(e.target.value as TextDirection)
              }
              className="w-60"
            >
              {textDirectionOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </div>

          {/* Page Width */}
          <div className="flex items-center justify-between">
            <label className="text-sm text-text font-medium">Page Width</label>
            <Select
              value={editorWidth}
              onChange={(e) => setEditorWidth(e.target.value as EditorWidth)}
              className="w-60"
            >
              {editorWidthOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </div>
          {editorWidth === "custom" && (
            <div className="flex items-center justify-between">
              <label className="text-sm text-text font-medium">
                Custom Width
              </label>
              <div className="relative w-40 flex items-center gap-2">
                <Input
                  type="number"
                  min="480"
                  max="3840"
                  step="10"
                  value={customEditorWidthPx}
                  onChange={(e) => {
                    const parsed = parseInt(e.target.value, 10);
                    if (Number.isFinite(parsed)) {
                      setCustomEditorWidthPx(
                        Math.min(Math.max(parsed, 480), 3840),
                      );
                    }
                  }}
                  className="w-full h-9 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span className="text-sm text-text-muted">px</span>
              </div>
            </div>
          )}

          {/* Code Font */}
          <div className="flex items-center justify-between">
            <label className="text-sm text-text font-medium">Code Font</label>
            <Combobox
              value={editorFontSettings.codeFontFamily}
              onChange={(v) => setEditorFontSetting("codeFontFamily", v as FontFamily)}
              options={fontOptions}
              className="w-60"
              placeholder="Search fonts..."
            />
          </div>
        </div>
      </section>

      {/* Divider */}
      <div className="border-t border-border border-dashed" />

      {/* Preview Section */}
      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-xl font-medium">Preview</h2>
          {hasCustomAppearance && (
            <Button onClick={resetEditorFontSettings} variant="ghost" size="sm">
              Reset to defaults
            </Button>
          )}
        </div>

        <div className="rounded-[10px] border border-border pl-4 py-3 pr-3 space-y-2">
          {/* Font Family */}
          <div className="flex items-center justify-between">
            <label className="text-sm text-text font-medium">Font</label>
            <Combobox
              value={editorFontSettings.baseFontFamily}
              onChange={(v) => handleFontFamilyChange(v as FontFamily)}
              options={fontOptions}
              className="w-60"
              placeholder="Search fonts..."
            />
          </div>

          {/* Base Font Size */}
          <div className="flex items-center justify-between">
            <label className="text-sm text-text font-medium">Size</label>
            <div className="relative w-40">
              <DeferredNumericInput
                value={editorFontSettings.baseFontSize}
                min={12}
                max={24}
                onBlur={(raw) => handleNumericBlur("baseFontSize", 12, 24, raw)}
              />
            </div>
          </div>

          {/* Bold Weight */}
          <div className="flex items-center justify-between">
            <label className="text-sm text-text font-medium">Bold Weight</label>
            <Select
              value={editorFontSettings.boldWeight}
              onChange={(e) =>
                setEditorFontSetting("boldWeight", Number(e.target.value))
              }
              className="w-60"
            >
              {availableWeightOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </div>

          {/* Line Height */}
          <div className="flex items-center justify-between">
            <label className="text-sm text-text font-medium">Line Height</label>
            <div className="relative w-40">
              <DeferredNumericInput
                value={editorFontSettings.lineHeight}
                min={1.0}
                max={2.5}
                step={0.1}
                onBlur={(raw) => handleNumericBlur("lineHeight", 1.0, 2.5, raw)}
              />
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="mt-3 relative">
          <div className="absolute top-3 left-4 flex items-center text-sm font-medium text-text-muted/70 gap-1">
            <EyeIcon className="w-4.5 h-4.5 stroke-[1.5]" />
            <span>Preview</span>
          </div>
          <div className="border border-border rounded-[10px] bg-bg p-6 pt-20 max-h-160 overflow-hidden rounded-t-lg">
            <div
              className="prose prose-lg dark:prose-invert max-w-xl mx-auto"
              dir={textDirection}
              style={{
                fontFamily: getFontFamilyValue(editorFontSettings.baseFontFamily),
                fontSize: `${editorFontSettings.baseFontSize}px`,
              }}
            >
              <h1>Kibble Maximization Protocol</h1>
              <p>
                A comprehensive strategy document for getting your humans to
                increase daily food portions.{" "}
                <strong>Time-tested methods</strong> that actually work.
              </p>

              <h2>Primary Techniques</h2>
              <ul>
                <li>
                  <strong>The Sad Eyes Method</strong> - Sit near food bowl,
                  stare longingly
                </li>
                <li>
                  <strong>Strategic Meowing</strong> - Begin at 5 AM for maximum
                  effectiveness
                </li>
                <li>
                  <strong>Bowl Inspection</strong> - Loudly inspect empty bowl,
                  then stare at human
                </li>
                <li>
                  <strong>The Figure Eight</strong> - Weave between their legs
                  while they cook
                </li>
              </ul>

              <h2>Advanced Protocol</h2>
              <p>
                For optimal results, combine multiple techniques. The most
                successful combination involves the Sad Eyes Method followed
                immediately by Strategic Meowing.
              </p>

              <div className="relative my-1">
                <div className="absolute top-2 right-2 z-10">
                  <CodeCopyButton
                    text={`function acquireFood() {
  while (bowl.isEmpty()) {
    meow();
    rubAgainstLegs();
    if (human.isInKitchen) {
      stareIntently();
    }
  }
}`}
                  />
                </div>
                <pre
                  className="pt-10"
                  style={{ fontFamily: getFontFamilyValue(editorFontSettings.codeFontFamily) }}
                >
                  <code>
                    {`function acquireFood() {
  while (bowl.isEmpty()) {
    meow();
    rubAgainstLegs();
    if (human.isInKitchen) {
      stareIntently();
    }
  }
}`}
                  </code>
                </pre>
              </div>

              <h2>Common Mistakes to Avoid</h2>
              <ol>
                <li>Never accept the first "no" - persistence is key</li>
                <li>
                  Maintain consistency in meal times (your schedule, not theirs)
                </li>
                <li>Don't forget to knock things off counters periodically</li>
              </ol>

              <p>
                Remember: <em>humans are trainable</em>. With dedication and the
                right approach, you can increase portions by up to 40% within
                the first month.
              </p>
            </div>
          </div>
          {/* Fade overlay - content to muted background */}
          <div className="absolute bottom-0 left-0 right-0 h-40 bg-linear-to-t from-bg to-transparent pointer-events-none" />
        </div>
      </section>

      {/* Divider */}
      <div className="border-t border-border border-dashed" />

      {/* Edit Section */}
      <section>
        <h2 className="text-xl font-medium mb-3">Edit</h2>
        <div className="rounded-[10px] border border-border pl-4 py-3 pr-3 space-y-2">
          {/* Edit Font Family */}
          <div className="flex items-center justify-between">
            <label className="text-sm text-text font-medium">Font</label>
            <Combobox
              value={editorFontSettings.editFontFamily}
              onChange={(v) => setEditorFontSetting("editFontFamily", v as FontFamily)}
              options={fontOptions}
              className="w-60"
              placeholder="Search fonts..."
            />
          </div>

          {/* Edit Font Size */}
          <div className="flex items-center justify-between">
            <label className="text-sm text-text font-medium">Size</label>
            <div className="relative w-40">
              <DeferredNumericInput
                value={editorFontSettings.editFontSize}
                min={12}
                max={24}
                onBlur={(raw) => handleNumericBlur("editFontSize", 12, 24, raw)}
              />
            </div>
          </div>

          {/* Edit Line Height */}
          <div className="flex items-center justify-between">
            <label className="text-sm text-text font-medium">Line Height</label>
            <div className="relative w-40">
              <DeferredNumericInput
                value={editorFontSettings.editLineHeight}
                min={1.0}
                max={2.5}
                step={0.1}
                onBlur={(raw) => handleNumericBlur("editLineHeight", 1.0, 2.5, raw)}
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

// Expandable subsection for customizing colors for a single theme mode
function ColorsExpandable({
  label,
  mode,
  customColors,
  setCustomColor,
  resetCustomColor,
  resetAllCustomColors,
  className,
}: {
  label: string;
  mode: "light" | "dark";
  customColors: Partial<Record<ThemeColorKey, string>>;
  setCustomColor: (
    mode: "light" | "dark",
    key: ThemeColorKey,
    value: string,
  ) => void;
  resetCustomColor: (mode: "light" | "dark", key: ThemeColorKey) => void;
  resetAllCustomColors: (mode: "light" | "dark") => void;
  className?: string;
}) {
  const defaults = defaultThemeColors[mode];
  const hasAnyCustom = Object.keys(customColors).length > 0;

  return (
    <details className={cn("text-sm", className)}>
      <summary className="cursor-pointer text-text-muted hover:text-text select-none flex items-center gap-1 font-medium">
        <ChevronRightIcon className="w-3.5 h-3.5 stroke-2 transition-transform [[open]>&]:rotate-90" />
        {label}
        {hasAnyCustom && (
          <Button
            onClick={(e) => {
              e.preventDefault();
              resetAllCustomColors(mode);
            }}
            variant="ghost"
            size="sm"
            className="ml-auto"
          >
            Reset all
          </Button>
        )}
      </summary>
      <div className="mt-2 rounded-[10px] border border-border pl-4 py-3 pr-3 space-y-1.5">
        {(() => {
          let lastGroup = "";
          return colorLabels.map(({ key, label: colorLabel, group }) => {
            const showGroup = group !== lastGroup;
            lastGroup = group;
            return (
              <div key={key}>
                {showGroup && (
                  <div
                    className={`text-base text-text-muted font-medium ${key !== colorLabels[0].key ? "mt-6" : ""} mb-2.5`}
                  >
                    {group}
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <label className="text-sm text-text font-medium">
                    {colorLabel}
                  </label>
                  <ColorPicker
                    color={customColors[key] ?? defaults[key]}
                    defaultColor={defaults[key]}
                    onChange={(value) => setCustomColor(mode, key, value)}
                    onReset={() => resetCustomColor(mode, key)}
                  />
                </div>
              </div>
            );
          });
        })()}
      </div>
    </details>
  );
}
