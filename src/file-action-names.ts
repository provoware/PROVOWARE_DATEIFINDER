// Entspricht file_actions::valid_name: maximale UTF-8-Bytezahl und Unicode-Steuerzeichen.
export function validActionName(name: string): boolean {
  return name.length > 0 && new TextEncoder().encode(name).length <= 100 && name === name.trim()
    && !name.startsWith(".") && !name.endsWith(".")
    && !/[\\/:*?"<>|\p{Cc}\u061c\u200e\u200f\u2028-\u202e\u2066-\u206f\u00ad\u034f\u180e\u200b\u2060-\u2065\ufeff]/u.test(name);
}
