import React from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { html } from '@codemirror/lang-html';
import { EditorView } from '@codemirror/view';

interface HtmlCodeEditorProps {
  // value/onChange are injected by AntD Form.Item, so both are optional.
  value?: string;
  onChange?: (value: string) => void;
  height?: string;
  placeholder?: string;
}

// @uiw's default theme paints a grey focus `outline` on `.cm-editor.cm-focused`
// that flashes before our base.css blue border wins. Remove it at the source so
// only base.css styles the focus state.
const noFocusOutline = EditorView.theme({
  '&.cm-focused': { outline: 'none' },
});

// Controlled HTML source editor built on @uiw/react-codemirror. Shaped as a
// value/onChange component so it drops straight into an AntD Form.Item. The
// visual chrome (border, radius, hover/focus ring) comes from the global
// `.cm-editor` rules in base.css — identical to the Custom CSS settings field,
// so no wrapper border is set here.
const HtmlCodeEditor = ({
  value = '',
  onChange,
  height = '360px',
  placeholder,
}: HtmlCodeEditorProps) => (
  <CodeMirror
    value={value}
    height={height}
    extensions={[html(), noFocusOutline]}
    placeholder={placeholder}
    onChange={(next) => onChange?.(next)}
    basicSetup={{
      lineNumbers: true,
      foldGutter: true,
      highlightActiveLine: true,
      autocompletion: true,
    }}
  />
);

export default HtmlCodeEditor;
