import { useEffect, useRef, useCallback, useState, forwardRef, useImperativeHandle } from "react";
import { EditorView, keymap, lineNumbers, highlightActiveLine } from "@codemirror/view";
import { EditorState, Compartment, type Text } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { defaultKeymap, indentWithTab, history, historyKeymap } from "@codemirror/commands";
import { syntaxHighlighting, HighlightStyle, LanguageDescription } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { CodeCopyButton } from "../ui/CodeCopyButton";

interface CodeMirrorEditorProps {
  content: string;
  onSave: (content: string) => void;
  onChange?: (content: string) => void;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  codeFontFamily: string;
  textDirection: "ltr" | "rtl" | "auto";
  isDark: boolean;
  showLineNumbers?: boolean;
  scrollResetKey?: string;
}

interface HoveredParagraph {
  from: number;
  to: number;
  text: string;
  left: number;
  top: number;
}

const PARAGRAPH_COPY_GUTTER_PX = 36;

function isParagraphBoundaryLine(text: string): boolean {
  return !text.trim() || text.trim() === "---";
}

function findParagraphAt(doc: Text, pos: number): { from: number; to: number; text: string } | null {
  const line = doc.lineAt(pos);
  if (isParagraphBoundaryLine(line.text)) return null;

  let startLine = line;
  while (startLine.number > 1) {
    const previousLine = doc.line(startLine.number - 1);
    if (isParagraphBoundaryLine(previousLine.text)) break;
    startLine = previousLine;
  }

  let endLine = line;
  while (endLine.number < doc.lines) {
    const nextLine = doc.line(endLine.number + 1);
    if (isParagraphBoundaryLine(nextLine.text)) break;
    endLine = nextLine;
  }

  return {
    from: startLine.from,
    to: endLine.to,
    text: doc.sliceString(startLine.from, endLine.to),
  };
}

function buildTheme(fontFamily: string, fontSize: number, lineHeight: number, codeFontFamily: string, isDark: boolean) {
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
        padding: `2rem max(1.5rem, calc((100% - var(--editor-max-width, 48rem)) / 2)) 6rem max(${1.5 + PARAGRAPH_COPY_GUTTER_PX / 16}rem, calc((100% - var(--editor-max-width, 48rem)) / 2 + ${PARAGRAPH_COPY_GUTTER_PX}px))`,
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
        backgroundColor: "transparent",
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
        fontFamily: codeFontFamily,
        fontSize: "0.9em",
      },
    },
    { dark: isDark },
  );
}

function buildSyntaxHighlighting(codeFontFamily: string) {
  return syntaxHighlighting(
    HighlightStyle.define(
      [
        { tag: tags.keyword, color: "var(--color-syntax-keyword)" },
        { tag: [tags.string, tags.regexp], color: "var(--color-syntax-string)" },
        { tag: [tags.number, tags.bool], color: "var(--color-syntax-number)" },
        { tag: tags.lineComment, color: "var(--color-syntax-comment)", fontStyle: "italic" },
        { tag: tags.blockComment, color: "var(--color-syntax-comment)", fontStyle: "italic" },
        { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: "var(--color-syntax-function)" },
        { tag: [tags.variableName, tags.self], color: "var(--color-syntax-variable)" },
        { tag: [tags.typeName, tags.className], color: "var(--color-syntax-type)" },
        { tag: tags.operator, color: "var(--color-syntax-operator)" },
        { tag: tags.attributeName, color: "var(--color-syntax-attr)" },
        { tag: tags.deleted, color: "var(--color-syntax-variable)" },
        { tag: tags.inserted, color: "var(--color-syntax-string)" },
      ],
      { all: { fontFamily: codeFontFamily } },
    ),
  );
}

const CODE_LANGUAGES = [
  LanguageDescription.of({ name: "javascript", alias: ["js", "jsx"], load: async () => (await import("@codemirror/lang-javascript")).javascript() }),
  LanguageDescription.of({ name: "typescript", alias: ["ts", "tsx"], load: async () => (await import("@codemirror/lang-javascript")).javascript({ typescript: true }) }),
  LanguageDescription.of({ name: "python", alias: ["py"], load: async () => (await import("@codemirror/lang-python")).python() }),
  LanguageDescription.of({ name: "rust", alias: ["rs"], load: async () => (await import("@codemirror/lang-rust")).rust() }),
  LanguageDescription.of({ name: "css", load: async () => (await import("@codemirror/lang-css")).css() }),
  LanguageDescription.of({ name: "html", load: async () => (await import("@codemirror/lang-html")).html() }),
  LanguageDescription.of({ name: "java", load: async () => (await import("@codemirror/lang-java")).java() }),
  LanguageDescription.of({ name: "sql", load: async () => (await import("@codemirror/lang-sql")).sql() }),
  LanguageDescription.of({ name: "json", load: async () => (await import("@codemirror/lang-json")).json() }),
  LanguageDescription.of({ name: "cpp", alias: ["c"], load: async () => (await import("@codemirror/lang-cpp")).cpp() }),
  LanguageDescription.of({ name: "go", alias: ["golang"], load: async () => (await import("@codemirror/lang-go")).go() }),
  LanguageDescription.of({ name: "php", load: async () => (await import("@codemirror/lang-php")).php() }),
  LanguageDescription.of({ name: "yaml", alias: ["yml"], load: async () => (await import("@codemirror/lang-yaml")).yaml() }),
  LanguageDescription.of({ name: "xml", load: async () => (await import("@codemirror/lang-xml")).xml() }),
];

export interface CodeMirrorEditorHandle {
  focus(): void;
  focusEnd(): void;
}

export const CodeMirrorEditor = forwardRef<CodeMirrorEditorHandle, CodeMirrorEditorProps>(function CodeMirrorEditor({
  content,
  onSave,
  onChange,
  fontFamily,
  fontSize,
  lineHeight,
  codeFontFamily,
  textDirection,
  isDark,
  showLineNumbers = false,
  scrollResetKey,
}: CodeMirrorEditorProps, ref) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const latestHoverRef = useRef<HoveredParagraph | null>(null);
  const themeCompartment = useRef(new Compartment());
  const lineNumbersCompartment = useRef(new Compartment());
  const codeFontCompartment = useRef(new Compartment());
  const [hoveredParagraph, setHoveredParagraph] = useState<HoveredParagraph | null>(null);

  const clearHoveredParagraph = useCallback(() => {
    latestHoverRef.current = null;
    setHoveredParagraph(null);
  }, []);

  const setHoveredParagraphFromPos = useCallback((view: EditorView, pos: number | null) => {
    if (pos === null) {
      clearHoveredParagraph();
      return;
    }

    const paragraph = findParagraphAt(view.state.doc, pos);
    if (!paragraph) {
      clearHoveredParagraph();
      return;
    }

    const coords = view.coordsAtPos(paragraph.from);
    const editorRect = wrapperRef.current?.getBoundingClientRect() ?? view.dom.getBoundingClientRect();
    if (!coords) {
      clearHoveredParagraph();
      return;
    }

    const nextParagraph: HoveredParagraph = {
      ...paragraph,
      left: Math.max(4, coords.left - editorRect.left - PARAGRAPH_COPY_GUTTER_PX + 4),
      top: coords.top - editorRect.top,
    };

    const previousParagraph = latestHoverRef.current;
    if (
      previousParagraph &&
      previousParagraph.from === nextParagraph.from &&
      previousParagraph.to === nextParagraph.to &&
      previousParagraph.left === nextParagraph.left &&
      previousParagraph.top === nextParagraph.top
    ) {
      return;
    }

    latestHoverRef.current = nextParagraph;
    setHoveredParagraph(nextParagraph);
  }, [clearHoveredParagraph]);

  useImperativeHandle(ref, () => ({
    focus() {
      viewRef.current?.focus();
    },
    focusEnd() {
      const view = viewRef.current;
      if (!view) return;
      view.dispatch({ selection: { anchor: view.state.doc.length } });
      view.focus();
    },
  }), []);

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
        markdown({ codeLanguages: CODE_LANGUAGES }),
        lineNumbersCompartment.current.of(showLineNumbers ? lineNumbers() : []),
        highlightActiveLine(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        saveKeymap,
        themeCompartment.current.of(buildTheme(fontFamily, fontSize, lineHeight, codeFontFamily, isDark)),
        codeFontCompartment.current.of(buildSyntaxHighlighting(codeFontFamily)),
        EditorView.lineWrapping,
        EditorView.domEventHandlers({
          mousemove: (event, view) => {
            const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
            setHoveredParagraphFromPos(view, pos);
          },
        }),
        EditorView.updateListener.of((update) => {
          if (
            latestHoverRef.current &&
            (update.docChanged || update.viewportChanged || update.geometryChanged)
          ) {
            setHoveredParagraphFromPos(update.view, latestHoverRef.current.from);
          }

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
      effects: [
        themeCompartment.current.reconfigure(
          buildTheme(fontFamily, fontSize, lineHeight, codeFontFamily, isDark),
        ),
        codeFontCompartment.current.reconfigure(
          buildSyntaxHighlighting(codeFontFamily),
        ),
      ],
    });
  }, [fontFamily, fontSize, lineHeight, codeFontFamily, isDark]);

  // Update line numbers when setting changes
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: lineNumbersCompartment.current.reconfigure(
        showLineNumbers ? lineNumbers() : [],
      ),
    });
  }, [showLineNumbers]);

  // Scroll to top on note switch (runs after content sync effect above)
  useEffect(() => {
    if (scrollResetKey !== undefined) {
      viewRef.current?.scrollDOM.scrollTo(0, 0);
      clearHoveredParagraph();
    }
  }, [scrollResetKey, clearHoveredParagraph]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const handleScroll = () => {
      if (!latestHoverRef.current) return;
      setHoveredParagraphFromPos(view, latestHoverRef.current.from);
    };

    view.scrollDOM.addEventListener("scroll", handleScroll);
    return () => view.scrollDOM.removeEventListener("scroll", handleScroll);
  }, [setHoveredParagraphFromPos]);

  return (
    <div
      ref={wrapperRef}
      className="cm-source-editor relative h-full overflow-hidden"
      dir={textDirection}
      onMouseLeave={clearHoveredParagraph}
    >
      <div
        ref={containerRef}
        className="h-full"
      />
      {hoveredParagraph && (
        <div
          className="absolute z-10"
          style={{ left: hoveredParagraph.left, top: hoveredParagraph.top }}
        >
          <CodeCopyButton
            text={hoveredParagraph.text}
            copyLabel=""
            copiedLabel=""
            className="h-7 w-7 justify-center rounded-full border border-border bg-bg/90 backdrop-blur-sm"
            iconClassName="w-4 h-4 stroke-[1.7]"
          />
        </div>
      )}
    </div>
  );
});
