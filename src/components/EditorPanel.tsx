import { useEffect, useState } from 'react';
import Editor from '@monaco-editor/react';
import type { IDockviewPanelProps } from 'dockview';
import { useAppServices } from '../providers/AppServicesProvider';
import { registerTicCompletions } from '../monaco/ticCompletions';

export function EditorPanel(_props: IDockviewPanelProps) {
  const { bridge, ready } = useAppServices();
  const [code, setCode] = useState('');
  const [language, setLanguage] = useState('lua');
  const [cartLoaded, setCartLoaded] = useState(false);

  useEffect(() => {
    if (!ready) {
      return;
    }

    setCode(bridge.getCode());
    setLanguage(bridge.getScriptLanguage());
    setCartLoaded(bridge.isCartLoaded());

    const unsubs = [
      bridge.onCodeChange(setCode),
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
            const next = value ?? '';
            setCode(next);
            bridge.syncCode(next);
          }}
          beforeMount={registerTicCompletions}
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
