import type { editor } from 'monaco-editor';

const HELPERS_QUERY_PARAM = 'helpers';
const TRUTHY_VALUES = new Set(['', '1', 'true', 'on', 'yes']);

/**
 * This is a pedagogical tool, so IDE-style programming aids (auto-closing
 * brackets/quotes, IntelliSense, hover, parameter hints, snippet completions,
 * etc.) are disabled by default: they short-circuit the parts of coding the
 * learner is meant to practice. They can be turned back on by adding
 * `?helpers` (or `?helpers=1`) to the URL.
 */
export function editorHelpersEnabled(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const value = new URLSearchParams(window.location.search).get(HELPERS_QUERY_PARAM);
  return value !== null && TRUTHY_VALUES.has(value.toLowerCase());
}

const BASE_OPTIONS: editor.IStandaloneEditorConstructionOptions = {
  minimap: { enabled: false },
  fontSize: 14,
  automaticLayout: true,
  scrollBeyondLastLine: false,
  wordWrap: 'on',
};

/**
 * Editor options that turn off every automatic "helper" behaviour Monaco
 * provides. Applied when {@link editorHelpersEnabled} is false.
 */
const NO_HELPERS_OPTIONS: editor.IStandaloneEditorConstructionOptions = {
  autoClosingBrackets: 'never',
  autoClosingQuotes: 'never',
  autoClosingComments: 'never',
  autoClosingDelete: 'never',
  autoClosingOvertype: 'never',
  autoSurround: 'never',
  quickSuggestions: false,
  suggestOnTriggerCharacters: false,
  wordBasedSuggestions: 'off',
  parameterHints: { enabled: false },
  hover: { enabled: false },
  snippetSuggestions: 'none',
  tabCompletion: 'off',
  acceptSuggestionOnEnter: 'off',
  inlineSuggest: { enabled: false },
};

export function buildEditorOptions(
  helpersEnabled: boolean,
): editor.IStandaloneEditorConstructionOptions {
  return helpersEnabled ? { ...BASE_OPTIONS } : { ...BASE_OPTIONS, ...NO_HELPERS_OPTIONS };
}
