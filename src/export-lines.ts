/** Keep one TXT-export record per file, even with unusual Linux filenames. */
export interface ExportableFile {
  displayName: string;
  path: string;
  sizeBytes: number;
}

const SPECIAL_CHARACTERS = /[\\\p{Cc}\p{Zl}\p{Zp}]/gu;

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
