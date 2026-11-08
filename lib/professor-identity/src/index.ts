export interface ProfessorNameAliases {
  canonicalByName: Map<string, string>;
  aliasesByCanonical: Map<string, string[]>;
}

interface ParsedName {
  raw: string;
  baseKey: string;
  exactKey: string;
  middleTokens: string[];
}

// Explicitly verified source alias; automatic matching stays conservative when initials conflict.
const EXPLICIT_IDENTITY_OVERRIDES = [
  ["Cox, Adam", "Cox, Adam B."],
  ["Cox, Adam M.", "Cox, Adam B."],
  ["Hemphill, Christopher", "Hemphill, Scott"],
  ["Sprigman, Christopher", "Sprigman, Christopher Jon"],
] as const;

function normalizeTokens(value: string): string[] {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function parseName(raw: string): ParsedName | null {
  const comma = raw.indexOf(",");
  if (comma < 1) return null;

  const surnameTokens = normalizeTokens(raw.slice(0, comma));
  const givenTokens = normalizeTokens(raw.slice(comma + 1));
  if (!surnameTokens.length || !givenTokens.length) return null;

  const baseKey = `${surnameTokens.join(" ")}\u0000${givenTokens[0]}`;
  const middleTokens = givenTokens.slice(1);
  return {
    raw,
    baseKey,
    exactKey: `${baseKey}\u0000${middleTokens.join(" ")}`,
    middleTokens,
  };
}

function hasDiacritics(value: string): number {
  return value.normalize("NFD").match(/[\u0300-\u036f]/g)?.length ?? 0;
}

function punctuationCount(value: string): number {
  return value.match(/[.,]/g)?.length ?? 0;
}

function chooseRepresentative(
  variants: ParsedName[],
  counts: Map<string, number>,
  preferMiddleInitial: boolean,
): string {
  const initialVariants = variants.filter(
    (variant) =>
      variant.middleTokens.length === 1 && variant.middleTokens[0].length === 1,
  );
  const candidates =
    preferMiddleInitial && initialVariants.length ? initialVariants : variants;

  return [...candidates].sort((a, b) => {
    const accentDifference = hasDiacritics(b.raw) - hasDiacritics(a.raw);
    if (accentDifference) return accentDifference;
    const punctuationDifference = punctuationCount(a.raw) - punctuationCount(b.raw);
    if (punctuationDifference) return punctuationDifference;
    const frequencyDifference = (counts.get(b.raw) ?? 0) - (counts.get(a.raw) ?? 0);
    if (frequencyDifference) return frequencyDifference;
    return a.raw.localeCompare(b.raw);
  })[0].raw;
}

function mapVariants(
  variants: ParsedName[],
  canonical: string,
  canonicalByName: Map<string, string>,
): void {
  for (const variant of variants) canonicalByName.set(variant.raw, canonical);
}

/**
 * Groups source professor spellings that share a surname and first name when
 * their only middle-name variation is one unambiguous initial. Conflicting
 * initials remain separate to avoid merging different people.
 */
export function buildProfessorNameAliases(
  names: Iterable<string>,
): ProfessorNameAliases {
  const counts = new Map<string, number>();
  for (const value of names) {
    const name = value.trim();
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  const canonicalByName = new Map(
    [...counts.keys()].map((name) => [name, name]),
  );
  const byBase = new Map<string, ParsedName[]>();

  for (const raw of counts.keys()) {
    const parsed = parseName(raw);
    if (!parsed) continue;
    const variants = byBase.get(parsed.baseKey) ?? [];
    variants.push(parsed);
    byBase.set(parsed.baseKey, variants);
  }

  for (const variants of byBase.values()) {
    const middleLetters = new Set(
      variants
        .filter((variant) => variant.middleTokens.length === 1)
        .map((variant) => variant.middleTokens[0][0]),
    );
    const hasInitial = variants.some(
      (variant) =>
        variant.middleTokens.length === 1 && variant.middleTokens[0].length === 1,
    );
    const compatibleMiddleNames = variants.every(
      (variant) => variant.middleTokens.length <= 1,
    );

    if (hasInitial && middleLetters.size === 1 && compatibleMiddleNames) {
      mapVariants(
        variants,
        chooseRepresentative(variants, counts, true),
        canonicalByName,
      );
      continue;
    }

    const exactVariants = new Map<string, ParsedName[]>();
    for (const variant of variants) {
      const group = exactVariants.get(variant.exactKey) ?? [];
      group.push(variant);
      exactVariants.set(variant.exactKey, group);
    }
    for (const group of exactVariants.values()) {
      mapVariants(
        group,
        chooseRepresentative(group, counts, false),
        canonicalByName,
      );
    }
  }

  for (const [alias, preferredName] of EXPLICIT_IDENTITY_OVERRIDES) {
    if (!counts.has(preferredName)) continue;
    canonicalByName.set(
      alias,
      canonicalByName.get(preferredName) ?? preferredName,
    );
  }

  const aliasesByCanonical = new Map<string, string[]>();
  for (const [name, canonical] of canonicalByName) {
    const aliases = aliasesByCanonical.get(canonical) ?? [];
    aliases.push(name);
    aliasesByCanonical.set(canonical, aliases);
  }
  for (const aliases of aliasesByCanonical.values()) aliases.sort((a, b) => a.localeCompare(b));

  return { canonicalByName, aliasesByCanonical };
}
