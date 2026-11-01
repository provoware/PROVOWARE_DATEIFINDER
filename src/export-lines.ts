/** Keep one TXT-export record per file, even with unusual Linux filenames. */
export interface ExportableFile {
  displayName: string;
  path: string;
  sizeBytes: number;
}

// Escape bidi and invisible formatting characters so TXT viewers show unambiguous filenames.
// Preserve U+200C/U+200D: they are used for shaping and joined emoji.
const SPECIAL_CHARACTERS = /[\\\p{Cc}\p{Zl}\p{Zp}\u00ad\u034f\u061c\u180e\u200b\u200e\u200f\u202a-\u202e\u2060-\u206f\ufeff]/gu;

function escapeExportField(value: string): string {
  return value.replace(SPECIAL_CHARACTERS, (character) => {
    switch (character) {
      case "\\": return "\\\\";
      case "\t": return "\\t";
      case "\n": return "\\n";
      case "\r": return "\\r";
      default: return "\\u" + character.charCodeAt(0).toString(16).padStart(4, "0");
    }
  });
}

export function formatExportLine(file: ExportableFile): string {
  return escapeExportField(file.displayName) + "\t" + escapeExportField(file.path) + "\t" + file.sizeBytes;
}
