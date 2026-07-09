import { useEffect, useRef, useState } from 'react';
import { useAppServices } from '../providers/AppServicesProvider';
import { parseCartTitle, sanitizeFilename } from '../bridge/cartFormat';

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function Toolbar() {
  const { bridge, ready } = useAppServices();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [booted, setBooted] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) {
      return;
    }
    setBooted(bridge.isCartLoaded());
    return bridge.onCartLoadedChange(setBooted);
  }, [bridge, ready]);

  const cartBaseName = (): string => sanitizeFilename(parseCartTitle(bridge.getCode()));

  const exportGame = async () => {
    setExporting(true);
    setError(null);
    try {
      const blob = await bridge.exportStandaloneHtml();
      downloadBlob(blob, `${cartBaseName()}.html`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const saveCode = () => {
    setError(null);
    try {
      const text = bridge.getCode();
      const ext = bridge.getScriptExtension();
      downloadBlob(new Blob([text], { type: 'text/plain' }), `${cartBaseName()}.${ext}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  };

  const loadCode = () => {
    setError(null);
    fileInputRef.current?.click();
  };

  const onFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset so selecting the same file again re-triggers change.
    event.target.value = '';
    if (!file) {
      return;
    }
    try {
      const text = await file.text();
      const dotIndex = file.name.lastIndexOf('.');
      const ext = dotIndex >= 0 ? file.name.slice(dotIndex + 1) : undefined;
      bridge.loadProjectText(text, ext);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Load failed');
    }
  };

  const hint = booted ? undefined : 'Boot TIC-80 (click the panel) to enable';

  return (
    <div className="app-toolbar">
      <button type="button" onClick={exportGame} disabled={!booted || exporting} title={hint}>
        {exporting ? 'Exporting…' : 'Export Game'}
      </button>
      <button type="button" onClick={saveCode} disabled={!booted} title={hint}>
        Save Code
      </button>
      <button type="button" onClick={loadCode} disabled={!booted} title={hint}>
        Load Code
      </button>
      {error && <span className="app-toolbar-error">{error}</span>}
      {!booted && <span className="app-toolbar-hint">{hint}</span>}
      <input
        ref={fileInputRef}
        type="file"
        className="app-toolbar-file"
        onChange={onFileSelected}
      />
    </div>
  );
}
