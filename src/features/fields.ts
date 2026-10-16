export interface NumberField {
  readonly kind: 'number'
  readonly isOptional: false
  optional(): Optional<NumberField>
}

export interface BooleanField {
  readonly kind: 'boolean'
  readonly isOptional: false
  optional(): Optional<BooleanField>
}

export interface TimestampField {
  readonly kind: 'timestamp'
  readonly isOptional: false
  optional(): Optional<TimestampField>
}

export interface CategoryField<Category extends string = string> {
  readonly kind: 'category'
  readonly isOptional: false
  readonly categories: readonly Category[]
  optional(): Optional<CategoryField<Category>>
}

/** A category whose values have a rank, such as 'cold' < 'warm' < 'hot'. */
export interface OrderedCategoryField<Category extends string = string> {
  readonly kind: 'ordered-category'
  readonly isOptional: false
  /** From lowest to highest. */
  readonly categories: readonly Category[]
  optional(): Optional<OrderedCategoryField<Category>>
}

export type RequiredField =
  | NumberField
  | BooleanField
  | CategoryField
  | OrderedCategoryField
  | TimestampField

/**
 * A field whose values may be missing, built with `.optional()`. A wrapper
 * instead of a flag on each field, so hovers read `Optional<NumberField>`.
 * It has no `optional()`: calling it twice is a compile-time error.
 */
export type Optional<Field extends RequiredField> = Omit<
  Field,
  'isOptional' | 'optional'
> & { readonly isOptional: true }

// Listed one by one: `Optional<RequiredField>` would keep only the keys shared
// by every field and lose `categories`.
export type AnyField =
  | RequiredField
  | Optional<NumberField>
  | Optional<BooleanField>
  | Optional<CategoryField>
  | Optional<OrderedCategoryField>
  | Optional<TimestampField>

const toOptional = <Field extends RequiredField>({
  optional: _,
  ...field
}: Field): Optional<Field> =>
  Object.freeze({ ...field, isOptional: true as const })

export const number = (): NumberField => {
  const field: NumberField = Object.freeze({
    kind: 'number',
    isOptional: false,
    optional: () => toOptional(field)
  })
  return field
}

export const boolean = (): BooleanField => {
  const field: BooleanField = Object.freeze({
    kind: 'boolean',
    isOptional: false,
    optional: () => toOptional(field)
  })
  return field
}

export const timestamp = (): TimestampField => {
  const field: TimestampField = Object.freeze({
    kind: 'timestamp',
    isOptional: false,
    optional: () => toOptional(field)
  })
  return field
}

/** Checks the list at runtime and returns a frozen copy. */
const checkCategories = <Category extends string>(
  name: string,
  categories: readonly Category[]
): readonly Category[] => {
  if (categories.length === 0) {
    throw new TypeError(`${name} needs at least one category`)
  }
  const seen = new Set<string>()
  for (const value of categories) {
    if (typeof value !== 'string') {
      throw new TypeError(
        `${name} only accepts strings, received ${String(value)}`
      )
    }
    if (seen.has(value)) {
      throw new TypeError(`${name} received '${value}' more than once`)
    }
    seen.add(value)
  }
  return Object.freeze([...categories])
}

export const category = <
  const Categories extends readonly [string, ...string[]]
>(
  categories: Categories
): CategoryField<Categories[number]> => {
  const field: CategoryField<Categories[number]> = Object.freeze({
    kind: 'category',
    isOptional: false,
    categories: checkCategories('ml.category()', categories),
    optional: () => toOptional(field)
  })
  return field
}

/** Categories listed from lowest to highest. */
export const orderedCategory = <
  const Categories extends readonly [string, ...string[]]
>(
  categories: Categories
): OrderedCategoryField<Categories[number]> => {
  const field: OrderedCategoryField<Categories[number]> = Object.freeze({
    kind: 'ordered-category',
    isOptional: false,
    categories: checkCategories('ml.orderedCategory()', categories),
    optional: () => toOptional(field)
  })
  return field
}
