import type {
  StandardJSONSchemaV1,
  StandardSchemaV1
} from '../standard-schema.ts'
import { type Features, features } from './features.ts'
import {
  type AnyField,
  type BooleanField,
  boolean,
  type CategoryField,
  category,
  type NumberField,
  number
} from './fields.ts'
import type { Simplify } from './infer.ts'

// ── Types ────────────────────────────────────────────────────────────────────

type IsOptionalKey<T, K extends keyof T> =
  Partial<Pick<T, K>> extends Pick<T, K>
    ? true
    : null extends T[K]
      ? true
      : undefined extends T[K]
        ? true
        : false

/** The field a value type maps to, or `never` when it needs an override. */
type AutoField<Value, IsOptional extends boolean> = [Value] extends [number]
  ? NumberField<IsOptional>
  : [Value] extends [boolean]
    ? BooleanField<IsOptional>
    : [Value] extends [string]
      ? string extends Value
        ? never
        : CategoryField<Value, IsOptional>
      : never

type AutoShape<T> = {
  [K in keyof T]-?: AutoField<NonNullable<T[K]>, IsOptionalKey<T, K>>
}

/** Keys that can't be mapped automatically, such as free strings and dates. */
export type UnmappableKeys<T> = {
  [K in keyof T]-?: [AutoShape<T>[K]] extends [never] ? K : never
}[keyof T]

export type Overrides<T> = {
  readonly [K in UnmappableKeys<T>]: AnyField
} & {
  readonly [K in Exclude<keyof T, UnmappableKeys<T>>]?: AnyField
}

export type FromSchemaShape<T, O> = Simplify<{
  // When no overrides are passed, O is the whole Overrides type and O[K] is
  // `AnyField | undefined`, so the automatic field is used.
  readonly [K in keyof T]-?: K extends keyof O
    ? O[K] extends AnyField
      ? O[K]
      : Extract<AutoShape<T>[K], AnyField>
    : Extract<AutoShape<T>[K], AnyField>
}>

type Output<S extends StandardSchemaV1> = StandardSchemaV1.InferOutput<S>

// ── Runtime ──────────────────────────────────────────────────────────────────

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const typesOf = (schema: Record<string, unknown>): unknown[] => {
  if (Array.isArray(schema.type)) return schema.type
  return schema.type === undefined ? [] : [schema.type]
}

/** Maps one JSON Schema property to a field, or `undefined` when it can't. */
const fieldFromJsonSchema = (
  schema: unknown,
  isOptional: boolean
): AnyField | undefined => {
  if (!isRecord(schema)) return undefined
  // Zod writes some nullable types as `anyOf: [{ ...type }, { type: 'null' }]`
  if (Array.isArray(schema.anyOf)) {
    const members = schema.anyOf.filter(
      member => !(isRecord(member) && member.type === 'null')
    )
    const nullable = members.length < schema.anyOf.length
    return members.length === 1
      ? fieldFromJsonSchema(members[0], isOptional || nullable)
      : undefined
  }
  const types = typesOf(schema)
  const nullable = types.includes('null')
  const [type, ...rest] = types.filter(type => type !== 'null')
  if (type === undefined || rest.length > 0) return undefined

  let field: AnyField | undefined
  if (type === 'number' || type === 'integer') {
    field = number()
  } else if (type === 'boolean') {
    field = boolean()
  } else if (type === 'string') {
    const values = Array.isArray(schema.enum)
      ? schema.enum
      : schema.const === undefined
        ? []
        : [schema.const]
    const [first, ...others] = values
    if (typeof first === 'string') {
      field = category([first, ...others] as [string, ...string[]])
    }
  }
  return field !== undefined && (isOptional || nullable)
    ? field.optional()
    : field
}

const readJsonSchema = (schema: unknown): Record<string, unknown> => {
  const props: unknown = isRecord(schema) ? schema['~standard'] : undefined
  const converter: unknown = isRecord(props) ? props.jsonSchema : undefined
  if (!isRecord(converter) || typeof converter.input !== 'function') {
    throw new TypeError(
      'ml.fromSchema() needs a schema that implements Standard JSON Schema (~standard.jsonSchema), such as Zod 4.2+, ArkType 2.1.28+ or Valibot with @valibot/to-json-schema'
    )
  }
  const options: StandardJSONSchemaV1.Options = {
    target: 'draft-2020-12',
    // Zod throws on types JSON Schema can't represent, such as dates. With this
    // option they become `{}`, which is reported as needing an override.
    libraryOptions: { unrepresentable: 'any' }
  }
  const json: unknown = converter.input(options)
  if (!isRecord(json) || json.type !== 'object' || !isRecord(json.properties)) {
    throw new TypeError('ml.fromSchema() expects an object schema')
  }
  return json
}

/**
 * Builds features from a Standard Schema such as a Zod object. Numbers,
 * booleans and string enums are mapped automatically; other fields, such as
 * free strings and dates, need an override.
 */
export const fromSchema = <
  S extends StandardSchemaV1,
  const O extends Overrides<Output<S>>
>(
  schema: S,
  ...[overrides]: [UnmappableKeys<Output<S>>] extends [never]
    ? [overrides?: O]
    : [overrides: O]
): Features<FromSchemaShape<Output<S>, O>> => {
  const json = readJsonSchema(schema)
  const properties = json.properties as Record<string, unknown>
  const required = new Set(Array.isArray(json.required) ? json.required : [])
  const given: Record<string, AnyField> = overrides ?? {}

  for (const name of Object.keys(given)) {
    if (!(name in properties)) {
      throw new TypeError(
        `ml.fromSchema(): the override '${name}' is not a field of the schema`
      )
    }
  }

  const shape: Record<string, AnyField> = {}
  const unmappable: string[] = []
  for (const [name, property] of Object.entries(properties)) {
    const field =
      given[name] ?? fieldFromJsonSchema(property, !required.has(name))
    if (field === undefined) {
      unmappable.push(name)
    } else {
      shape[name] = field
    }
  }

  if (unmappable.length > 0) {
    const names = unmappable.map(name => `'${name}'`).join(', ')
    throw new TypeError(
      `ml.fromSchema() can't map ${names} automatically. Pass an override for each one, such as { ${unmappable[0]}: ml.category([...]) } or { ${unmappable[0]}: ml.timestamp() }`
    )
  }

  // Safe: every key of the schema got a field, either from the overrides or
  // mapped from JSON Schema with the same rules as FromSchemaShape.
  return features(shape as unknown as FromSchemaShape<Output<S>, O>)
}
