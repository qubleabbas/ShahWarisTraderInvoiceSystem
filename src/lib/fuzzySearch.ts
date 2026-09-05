/**
 * Flexible (Typo-Tolerant) Fuzzy Search Engine
 *
 * Supports:
 * - Substring matching
 * - ID matching (e.g. #12 or 12)
 * - Multi-word token matching
 * - Typo tolerance via Levenshtein edit distance (e.g. "sherbat" -> "sharbat", "bazori" -> "bazoori")
 */

function editDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

export function fuzzyMatchString(targetStr: string, queryStr: string): boolean {
  const target = targetStr.trim().toLowerCase();
  const query = queryStr.trim().toLowerCase();

  if (!query) return true;
  if (!target) return false;

  // 1. Direct substring match
  if (target.includes(query)) return true;

  // 2. Clean numeric / ID matching (e.g. query "12" or "#12")
  const cleanQuery = query.startsWith('#') ? query.slice(1) : query;
  if (cleanQuery && (target === cleanQuery || target === `#${cleanQuery}`)) return true;

  // 3. Tokenize query & target strings
  const queryTokens = query.split(/\s+/).filter(Boolean);
  const targetTokens = target.split(/[\s,./\-()#]+/).filter(Boolean);

  // All query tokens must match at least one target token (substring or fuzzy)
  return queryTokens.every(qToken => {
    // 3a. Token substring match
    if (targetTokens.some(tToken => tToken.includes(qToken))) return true;

    // 3b. Typo tolerance: Levenshtein edit distance check
    // Allow 1 typo for 4-6 char words, 2 typos for 7+ char words
    const maxAllowedEdits = qToken.length <= 3 ? 0 : qToken.length <= 6 ? 1 : 2;

    return targetTokens.some(tToken => {
      if (Math.abs(tToken.length - qToken.length) > maxAllowedEdits) return false;
      return editDistance(qToken, tToken) <= maxAllowedEdits;
    });
  });
}

export function fuzzyMatchMulti(fields: (string | number | undefined | null)[], query: string): boolean {
  if (!query.trim()) return true;

  const combinedStr = fields
    .filter((f): f is string | number => f !== undefined && f !== null)
    .map(f => (typeof f === 'number' ? `#${f} ID:${f} ${f}` : String(f)))
    .join(' ');

  return fuzzyMatchString(combinedStr, query);
}

export function fuzzyFilter<T>(
  items: T[],
  query: string,
  getFields: (item: T) => (string | number | undefined | null)[]
): T[] {
  if (!query || !query.trim()) return items;
  return items.filter(item => fuzzyMatchMulti(getFields(item), query));
}
