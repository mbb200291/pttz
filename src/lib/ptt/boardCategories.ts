export function normalizeCategoryOptions(categories?: readonly string[]): string[] {
  if (!categories) return [];

  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of categories) {
    const category = raw.trim();
    if (!category || seen.has(category)) continue;
    seen.add(category);
    result.push(category);
  }
  return result;
}

export function resolveBoardCategoryOptions(
  _boardName?: string,
  observedCategories?: readonly string[],
): string[] {
  return normalizeCategoryOptions(observedCategories);
}
