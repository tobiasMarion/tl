export interface NumberField<IsOptional extends boolean = false> {
  readonly kind: 'number'
  readonly isOptional: IsOptional
  optional(): NumberField<true>
}

export interface BooleanField<IsOptional extends boolean = false> {
  readonly kind: 'boolean'
  readonly isOptional: IsOptional
  optional(): BooleanField<true>
}

export interface TimestampField<IsOptional extends boolean = false> {
  readonly kind: 'timestamp'
  readonly isOptional: IsOptional
  optional(): TimestampField<true>
}

export interface CategoryField<
  Category extends string = string,
  IsOptional extends boolean = false
> {
  readonly kind: 'category'
  readonly isOptional: IsOptional
  readonly categories: readonly Category[]
  optional(): CategoryField<Category, true>
}

export type AnyField =
  | NumberField<boolean>
  | BooleanField<boolean>
  | CategoryField<string, boolean>
  | TimestampField<boolean>

const numberField = <IsOptional extends boolean>(
  isOptional: IsOptional
): NumberField<IsOptional> =>
  Object.freeze({
    kind: 'number',
    isOptional,
    optional: () => numberField(true)
  })

export const number = (): NumberField => numberField(false)

const booleanField = <IsOptional extends boolean>(
  isOptional: IsOptional
): BooleanField<IsOptional> =>
  Object.freeze({
    kind: 'boolean',
    isOptional,
    optional: () => booleanField(true)
  })

export const boolean = (): BooleanField => booleanField(false)

const timestampField = <IsOptional extends boolean>(
  isOptional: IsOptional
): TimestampField<IsOptional> =>
  Object.freeze({
    kind: 'timestamp',
    isOptional,
    optional: () => timestampField(true)
  })

export const timestamp = (): TimestampField => timestampField(false)

const categoryField = <Category extends string, IsOptional extends boolean>(
  categories: readonly Category[],
  isOptional: IsOptional
): CategoryField<Category, IsOptional> =>
  Object.freeze({
    kind: 'category',
    isOptional,
    categories,
    optional: () => categoryField(categories, true)
  })

export const category = <
  const Categories extends readonly [string, ...string[]]
>(
  categories: Categories
): CategoryField<Categories[number]> => {
  if (categories.length === 0) {
    throw new TypeError('ml.category() needs at least one category')
  }
  const seen = new Set<string>()
  for (const value of categories) {
    if (typeof value !== 'string') {
      throw new TypeError(
        `ml.category() only accepts strings, received ${String(value)}`
      )
    }
    if (seen.has(value)) {
      throw new TypeError(`ml.category() received '${value}' more than once`)
    }
    seen.add(value)
  }
  return categoryField(Object.freeze([...categories]), false)
}
