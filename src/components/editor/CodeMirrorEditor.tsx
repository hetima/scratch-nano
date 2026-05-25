import { useEffect, useRef, useCallback } from "react";
import { EditorView, keymap, lineNumbers, highlightActiveLine } from "@codemirror/view";
import { EditorState, Compartment } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { defaultKeymap, indentWithTab, history, historyKeymap } from "@codemirror/commands";

interface CodeMirrorEditorProps {
  content: string;
  onSave: (content: string) => void;
  onChange?: (content: string) => void;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  textDirection: "ltr" | "rtl" | "auto";
  isDark: boolean;
}

function buildTheme(fontFamily: string, fontSize: number, lineHeight: number, isDark: boolean) {
  return EditorView.theme(
    {
      "&": {
        height: "100%",
        fontSize: `${fontSize}px`,
        backgroundColor: "transparent",
        color: "var(--color-text)",
      },
      ".cm-content": {
        fontFamily,
        lineHeight: String(lineHeight),
        padding: "2rem 1.5rem 6rem",
        maxWidth: "var(--editor-max-width, 48rem)",
        margin: "0 auto",
        caretColor: "var(--color-text)",
      },
      ".cm-cursor": {
        borderLeftColor: "var(--color-text)",
      },
      ".cm-scroller": {
        overflow: "auto",
      },
      ".cm-gutters": {
        backgroundColor: "transparent",
        color: "var(--color-text-muted)",
        border: "none",
        paddingRight: "8px",
      },
      ".cm-activeLineGutter": {
        backgroundColor: "transparent",
        color: "var(--color-text)",
      },
      ".cm-activeLine": {
        backgroundColor: "var(--color-bg-muted)",
      },
      ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
        backgroundColor: "var(--color-selection) !important",
      },
      ".cm-focused": {
        outline: "none",
      },
      ".cm-header-1": { fontSize: "1.6em", fontWeight: "bold" },
      ".cm-header-2": { fontSize: "1.4em", fontWeight: "bold" },
      ".cm-header-3": { fontSize: "1.2em", fontWeight: "bold" },
      ".cm-header-4": { fontSize: "1.1em", fontWeight: "bold" },
      ".cm-header-5": { fontSize: "1em", fontWeight: "bold" },
      ".cm-header-6": { fontSize: "0.9em", fontWeight: "bold" },
      ".cm-strong": { fontWeight: "bold" },
      ".cm-em": { fontStyle: "italic" },
      ".cm-link": {
        color: "var(--color-accent)",
        textDecoration: "underline",
      },
      ".cm-url": { opacity: 0.6 },
      ".cm-strikethrough": { textDecoration: "line-through" },
      ".cm-comment": { color: "var(--color-text-muted)" },
      ".cm-monospace": {
        fontFamily:
          "ui-monospace, 'SF Mono', SFMono-Regular, Menlo, monospace",
        fontSize: "0.9em",
      },
    },
    { dark: isDark },
  );
}

export function CodeMirrorEditor({
  content,
  onSave,
  onChange,
  fontFamily,
  fontSize,
  lineHeight,
  textDirection,
  isDark,
}: CodeMirrorEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeCompartment = useRef(new Compartment());
  // Track the content we last set from outside, to avoid clobbering user edits
  // and to know when a save is actually needed
  const lastSetContent = useRef(content);
  // Keep callbacks in refs so updateListener always calls the latest version
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const handleSave = useCallback(() => {
    const view = viewRef.current;
    if (!view) return false;
    const newContent = view.state.doc.toString();
    if (newContent !== lastSetContent.current) {
      lastSetContent.current = newContent;
      onSaveRef.current(newContent);
    }
    return true;
  }, []);

  // Create editor on mount
  useEffect(() => {
    if (!containerRef.current) return;

    const saveKeymap = keymap.of([{ key: "Mod-s", run: handleSave }]);

    const state = EditorState.create({
      doc: content,
      extensions: [
        markdown(),
        lineNumbers(),
        highlightActiveLine(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        saveKeymap,
        themeCompartment.current.of(buildTheme(fontFamily, fontSize, lineHeight, isDark)),
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current?.(update.state.doc.toString());
          }
        }),
      ],
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Only on mount — handleSave is stable via useCallback
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync content from parent (note switch, reload)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentDoc = view.state.doc.toString();
    if (currentDoc !== content) {
      lastSetContent.current = content;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: content },
      });
    }
  }, [content]);

  // Update theme when settings change
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: themeCompartment.current.reconfigure(
        buildTheme(fontFamily, fontSize, lineHeight, isDark),
      ),
    });
  }, [fontFamily, fontSize, lineHeight, isDark]);

  return (
    <div
      ref={containerRef}
      className="cm-source-editor"
      dir={textDirection}
    />
  );
}
