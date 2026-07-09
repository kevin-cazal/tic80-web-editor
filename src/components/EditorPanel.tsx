import { useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import type { editor as MonacoEditor } from 'monaco-editor';
import type { IDockviewPanelProps } from 'dockview';
import { useAppServices } from '../providers/AppServicesProvider';
import { registerTicCompletions } from '../monaco/ticCompletions';

export function EditorPanel(_props: IDockviewPanelProps) {
  const { bridge, ready } = useAppServices();
  const [code, setCode] = useState('');
  const [language, setLanguage] = useState('lua');
  const [cartLoaded, setCartLoaded] = useState(false);
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);

  useEffect(() => {
    if (!ready) {
      return;
    }

    setCode(bridge.getCode());
    setLanguage(bridge.getScriptLanguage());
    setCartLoaded(bridge.isCartLoaded());

    const unsubs = [
      bridge.onCodeChange((pushed) => {
        // Only feed the editor when the change genuinely differs from what it
        // already shows. Skipping equal pushes (the user's own keystrokes
        // round-tripping back) keeps the controlled `value` from lagging the
        // live model and flushing the cursor to the bottom while typing.
        const live = editorRef.current?.getValue() ?? null;
        if (live === null || pushed !== live) {
          setCode(pushed);
        }
      }),
      bridge.onLanguageChange(setLanguage),
      bridge.onCartLoadedChange(setCartLoaded),
    ];

    return () => {
      for (const unsub of unsubs) {
        unsub();
      }
    };
  }, [bridge, ready]);

  return (
    <div className="panel-fill">
      {!ready ? (
        <div className="panel-message">Starting editor...</div>
      ) : !cartLoaded ? (
        <div className="panel-message">Click TIC-80 to boot, then the active cart will appear here.</div>
      ) : (
        <Editor
          language={language}
          theme="vs-dark"
          value={code}
          onChange={(value) => {
            // Do not push the typed value back into the controlled `value`;
            // the editor already holds it. Round-tripping it through React state
            // makes the `value` prop lag the live model during fast typing,
            // which forces a full-model replace that flushes the cursor. The
            // bridge is the source of truth for the code content.
            bridge.syncCode(value ?? '');
          }}
          beforeMount={registerTicCompletions}
          onMount={(editor) => {
            editorRef.current = editor;
          }}
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            automaticLayout: true,
            scrollBeyondLastLine: false,
            wordWrap: 'on',
          }}
        />
      )}
    </div>
  );
}
