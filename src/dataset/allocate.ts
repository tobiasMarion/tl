// Splits `total` into integer quotas proportional to `counts`, summing exactly
// to `total` (largest remainder, or Hamilton, method). Each count first gets
// the floor of its exact share; the units left over go to the largest
// fractional parts. Ties go to the earlier count, so the result is
// deterministic.
//
// Stratified splits use it to give each class its share of a block. With 50
// Adelie, 30 Chinstrap and 20 Gentoo and a test block of 7, the exact shares
// are 3.5, 2.1 and 1.4. Floors give 3, 2 and 1 (6 rows); the one unit left
// goes to Adelie, the largest remainder (0.5), so the result is [4, 2, 1].
// Rounding every class up would give 4 + 3 + 2 = 9 rows instead of 7.
export const allocate = (
  counts: readonly number[],
  total: number
): number[] => {
  const n = counts.reduce((sum, count) => sum + count, 0)
  if (n === 0) return counts.map(() => 0)

  // Multiplying first keeps whole shares exact: count * total is an integer,
  // and dividing integers rounds correctly. count * (total / n) would not.
  const exact = counts.map(count => (count * total) / n)
  const quotas = exact.map(Math.floor)
  const remainders = exact.map((value, i) => value - (quotas[i] as number))

  let left = total - quotas.reduce((sum, quota) => sum + quota, 0)
  // Sort is stable, so equal remainders keep their original order
  const byRemainder = counts
    .map((_, i) => i)
    .sort((a, b) => (remainders[b] as number) - (remainders[a] as number))
  for (const i of byRemainder) {
    if (left === 0) break
    quotas[i] = (quotas[i] as number) + 1
    left--
  }
  return quotas
}
