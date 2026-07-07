import type { Monaco } from '@monaco-editor/react';
import type { editor, Position } from 'monaco-editor';

const TIC_API_SUGGESTIONS = [
  { label: 'cls', insertText: 'cls(${1:color})', detail: 'Clear screen' },
  { label: 'spr', insertText: 'spr(${1:id}, ${2:x}, ${2:y}, ${3:colorkey})', detail: 'Draw sprite' },
  { label: 'print', insertText: 'print("${1:text}", ${2:x}, ${3:y}, ${4:color})', detail: 'Print text' },
  { label: 'btn', insertText: 'btn(${1:id})', detail: 'Read button state' },
  { label: 'key', insertText: 'key(${1:id})', detail: 'Read key state' },
  { label: 'map', insertText: 'map(${1:x}, ${2:y}, ${3:width}, ${4:height}, ${5:sx}, ${6:sy})', detail: 'Draw map region' },
  { label: 'mget', insertText: 'mget(${1:x}, ${2:y})', detail: 'Get map tile' },
  { label: 'mset', insertText: 'mset(${1:x}, ${2:y}, ${3:id})', detail: 'Set map tile' },
  { label: 'pix', insertText: 'pix(${1:x}, ${2:y}, ${3:color})', detail: 'Draw or read pixel' },
  { label: 'line', insertText: 'line(${1:x0}, ${2:y0}, ${3:x1}, ${4:y1}, ${5:color})', detail: 'Draw line' },
  { label: 'rect', insertText: 'rect(${1:x}, ${2:y}, ${3:w}, ${4:h}, ${5:color})', detail: 'Draw rectangle' },
  { label: 'circ', insertText: 'circ(${1:x}, ${2:y}, ${3:radius}, ${4:color})', detail: 'Draw circle' },
  { label: 'tri', insertText: 'tri(${1:x1}, ${2:y1}, ${3:x2}, ${4:y2}, ${5:x3}, ${6:y3}, ${7:color})', detail: 'Draw triangle' },
  { label: 'sfx', insertText: 'sfx(${1:id}, ${2:note}, ${3:duration}, ${4:channel})', detail: 'Play sound effect' },
  { label: 'music', insertText: 'music(${1:track})', detail: 'Play music track' },
  { label: 'sync', insertText: 'sync(${1:mask}, ${2:bank}, ${3:toBank})', detail: 'Sync cartridge banks' },
  { label: 'reset', insertText: 'reset()', detail: 'Reset game' },
  { label: 'exit', insertText: 'exit()', detail: 'Exit game' },
  { label: 'time', insertText: 'time()', detail: 'Elapsed milliseconds' },
  { label: 'tstamp', insertText: 'tstamp()', detail: 'Unix timestamp' },
  { label: 'trace', insertText: 'trace(${1:value})', detail: 'Log to console' },
  { label: 'peek', insertText: 'peek(${1:addr})', detail: 'Read memory byte' },
  { label: 'poke', insertText: 'poke(${1:addr}, ${2:value})', detail: 'Write memory byte' },
  { label: 'peek4', insertText: 'peek4(${1:addr})', detail: 'Read 32-bit value' },
  { label: 'poke4', insertText: 'poke4(${1:addr}, ${2:value})', detail: 'Write 32-bit value' },
  { label: 'memcpy', insertText: 'memcpy(${1:dest}, ${2:src}, ${3:len})', detail: 'Copy memory' },
  { label: 'memset', insertText: 'memset(${1:dest}, ${2:value}, ${3:len})', detail: 'Fill memory' },
  { label: 'clip', insertText: 'clip(${1:x}, ${2:y}, ${3:w}, ${4:h})', detail: 'Set clip region' },
  { label: 'font', insertText: 'font(${1:text}, ${2:x}, ${3:y}, ${4:color})', detail: 'Draw bitmap font text' },
];

export function registerTicCompletions(monaco: Monaco): void {
  monaco.languages.registerCompletionItemProvider('lua', {
    provideCompletionItems: (
      model: editor.ITextModel,
      position: Position,
    ) => {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      return {
        suggestions: TIC_API_SUGGESTIONS.map((item) => ({
          label: item.label,
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: item.insertText,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: item.detail,
          range,
        })),
      };
    },
  });
}
