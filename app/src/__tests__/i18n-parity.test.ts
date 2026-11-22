/**
 * Guards against en.json / es.json drifting apart during the i18n migration:
 * a key present in one file but missing in the other makes next-intl throw
 * or render the raw key at runtime.
 */

import en from "../messages/en.json";
import es from "../messages/es.json";

type FlatMessages = Record<string, string>;

function flattenMessages(value: unknown, prefix = "", out: FlatMessages = {}): FlatMessages {
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (child !== null && typeof child === "object" && !Array.isArray(child)) {
      flattenMessages(child, path, out);
    } else {
      out[path] = String(child);
    }
  }
  return out;
}

function placeholders(message: string): string[] {
  return Array.from(message.matchAll(/\{(\w+)\}/g), (m) => m[1]).sort();
}

const enFlat = flattenMessages(en);
const esFlat = flattenMessages(es);
const enKeys = Object.keys(enFlat);
const esKeys = Object.keys(esFlat);

describe("i18n message parity", () => {
  it("has the same set of leaf keys in en.json and es.json", () => {
    const onlyInEn = enKeys.filter((key) => !(key in esFlat));
    const onlyInEs = esKeys.filter((key) => !(key in enFlat));

    expect({ onlyInEn, onlyInEs }).toEqual({ onlyInEn: [], onlyInEs: [] });
  });

  it("uses the same {placeholders} for every shared key", () => {
    const mismatches: Record<string, { en: string[]; es: string[] }> = {};

    for (const key of enKeys) {
      if (!(key in esFlat)) continue;
      const enPlaceholders = placeholders(enFlat[key]);
      const esPlaceholders = placeholders(esFlat[key]);
      if (enPlaceholders.join(",") !== esPlaceholders.join(",")) {
        mismatches[key] = { en: enPlaceholders, es: esPlaceholders };
      }
    }

    expect(mismatches).toEqual({});
  });
});
