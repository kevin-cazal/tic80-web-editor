import type { IDockviewPanelProps } from 'dockview';

// The REPL is a separate app (kevin-cazal/repl_runtime) vendored into public/repl/ at build time
// by scripts/fetch-repl.mjs. An iframe keeps its workers and styles apart from the editor, and
// its keyboard away from TIC-80.
const REPL_URL = `${import.meta.env.BASE_URL}repl/lua/`;

export function ReplPanel(_props: IDockviewPanelProps) {
  return (
    <div className="panel-fill repl-panel">
      <iframe className="repl-frame" src={REPL_URL} title="Lua REPL" />
    </div>
  );
}
