import { useEffect, useRef, useState } from 'react';
import type { IDockviewPanelProps } from 'dockview';
import { useAppServices } from '../providers/AppServicesProvider';

export function TicPanel(_props: IDockviewPanelProps) {
  const { bridge } = useAppServices();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<'click' | 'booting' | 'ready' | 'missing' | 'error'>('click');
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const available = await bridge.checkWasmAvailable();
      if (cancelled) {
        return;
      }
      if (!available) {
        setStatus('missing');
        return;
      }
      if (!window.TIC80_BOOTED) {
        setStatus('click');
      } else {
        setStatus('ready');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [bridge]);

  const startTic = () => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    setStatus('booting');
    setError(null);
    canvas.focus();
    bridge.unlockAudio();

    bridge
      .loadWasm(canvas)
      .then(() => {
        canvas.focus();
        setStatus('ready');
      })
      .catch((err) => {
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Failed to start TIC-80');
      });
  };

  const focusCanvas = () => {
    if (status === 'ready' || status === 'booting') {
      canvasRef.current?.focus();
      bridge.unlockAudio();
    }
  };

  const exportStandalone = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const blob = await bridge.exportStandaloneHtml();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'tic80-game.html';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="panel-fill tic-panel" onPointerDown={focusCanvas}>
      {status === 'ready' && (
        <div className="tic-toolbar">
          <button
            type="button"
            className="tic-export-button"
            onClick={exportStandalone}
            disabled={exporting}
            title="Download a single self-contained HTML file that runs this cart offline (open it directly, no server needed)"
          >
            {exporting ? 'Exporting…' : 'Export standalone HTML'}
          </button>
          {exportError && <span className="tic-export-error">{exportError}</span>}
        </div>
      )}

      {status === 'missing' && (
        <div className="panel-message tic-overlay">
          <h3>TIC-80 WASM not found</h3>
          <p>
            Place <code>tic80.js</code>, <code>tic80.wasm</code>, and optional <code>tic80.data</code> in{' '}
            <code>public/tic80/</code>.
          </p>
          <p>See README for PRO build instructions.</p>
        </div>
      )}

      {status === 'error' && (
        <div className="panel-message tic-overlay">
          <h3>Failed to load TIC-80</h3>
          <p>{error}</p>
          <button type="button" onClick={() => window.location.reload()}>
            Reload page
          </button>
        </div>
      )}

      {status === 'click' && (
        <button type="button" className="panel-message tic-overlay tic-start-button" onClick={startTic}>
          <h3>CLICK TO PLAY</h3>
        </button>
      )}

      <canvas
        ref={canvasRef}
        id="canvas"
        className="tic-canvas"
        tabIndex={0}
        width={240}
        height={136}
      />
    </div>
  );
}
