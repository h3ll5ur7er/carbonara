// Names for Factorio's prototypes. Hides the game's locale format: `.cfg` files of `[section]` and `key=value`
// lines (data/<mod>/locale/en/<mod>.cfg), and localised strings, `["key", parameters…]`, whose text has `__1__`
// placeholders for the parameters.

/** Translations by full key: `item-name.iron-plate` → `Iron plate`. */
export type Locale = Map<string, string>;

export function parseLocale(texts: string[]): Locale {
  const locale: Locale = new Map();
  for (const text of texts) {
    let section = "";
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (line === "" || line.startsWith(";") || line.startsWith("#")) continue;
      const header = /^\[([^\]]+)\]$/.exec(line);
      if (header) {
        section = header[1] as string;
        continue;
      }
      const equals = line.indexOf("=");
      if (equals < 1) continue;
      const key = line.slice(0, equals);
      locale.set(section ? `${section}.${key}` : key, line.slice(equals + 1));
    }
  }
  return locale;
}

/**
 * The text of a localised string, or undefined when a key it needs is missing. A plain string is literal text;
 * `["", a, b]` joins its parameters; `["?", a, b]` takes the first that resolves.
 */
export function localise(value: unknown, locale: Locale): string | undefined {
  if (typeof value === "string") return value;
  if (!Array.isArray(value) || typeof value[0] !== "string") return undefined;
  const [key, ...parameters] = value as [string, ...unknown[]];
  if (key === "?") {
    for (const parameter of parameters) {
      const text = localise(parameter, locale);
      if (text !== undefined) return text;
    }
    return undefined;
  }
  const texts = parameters.map((parameter) => localise(parameter, locale));
  if (texts.some((text) => text === undefined)) return undefined;
  if (key === "") return texts.join("");
  const template = locale.get(key);
  return template?.replace(/__(\d+)__/g, (placeholder, index: string) => texts[Number(index) - 1] ?? placeholder);
}

/** "assembling-machine-1" → "Assembling machine 1", the way the game's English names read. */
export function humanise(name: string): string {
  const words = name.replaceAll("-", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
