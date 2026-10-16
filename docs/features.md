# Feature DSL

The DSL defines the data schema using only the library. Users don't need to import Zod or any other validator.

```ts
const penguins = ml.features({
  species: ml.category(['Adelie', 'Chinstrap', 'Gentoo']),
  billLengthMm: ml.number().optional(),
  isAdult: ml.boolean(),
  observedAt: ml.timestamp()
})

type Penguin = typeof penguins.infer // or Infer<typeof penguins>
// {
//   species: 'Adelie' | 'Chinstrap' | 'Gentoo'
//   billLengthMm?: number | undefined
//   isAdult: boolean
//   observedAt: Date
// }

penguins.parse(record) // one record
penguins.parseRows(rows) // many records, issues grouped by field
```

## Requirements

- Infer the record type from the schema.
- Represent categories as literal unions.
- Reject at compile time values of the wrong type (`age: '28'`) and categories that weren't declared.
- Validate external data at runtime, with messages that point to the field and the problem.
- Mark optional fields in the type, so the pipeline [requires a policy](preprocessing.md#missing-values) for them.
- Only `timestamp` fields can be used as the `time` key of a [series](dataset.md#dataset-and-series), and only `category` fields as its `group`.

## Field types

| Constructor        | Inferred type      | Status |
|--------------------|--------------------|--------|
| `ml.number()`      | `number`           | done   |
| `ml.boolean()`     | `boolean`          | done   |
| `ml.category([…])` | literal union      | done   |
| `ml.timestamp()`   | `Date`             | done   |
| `.optional()`      | `T \| undefined`   | done   |

`ml.category([…])` needs at least one category and rejects duplicates, both at compile time and at runtime. Its declaration order is kept: it is the column order the encoder produces.

## Runtime validation

- **Missing values:** `undefined`, `null`, and `NaN` count as missing. An optional field turns them into `undefined`; a required field reports them.
- **Numbers** must be finite. `Infinity` is rejected.
- **Timestamps** must be valid `Date` instances.
- **Undeclared fields** are dropped from the output, so a CSV can carry extra columns such as an id.
- **No coercion:** `'39.1'` is not a number. Parsing strings from CSV is part of loading data (see [Dataset](dataset.md)).

`parseRows` groups issues by field and problem, so 100k rows with one bad column produce one message, not 100k:

```
Invalid features: 3 problems found
  - 'species' received unknown categories in 1 row (index 1): 'Adelie '. Expected one of 'Adelie' | 'Chinstrap' | 'Gentoo'
  - 'bodyMassG' expected a finite number in 2 rows (index 1, 2), received 'NA'
  - 'bodyMassG' is required but missing in 1 row (index 3). Mark it with .optional() if missing values are expected
```

Errors are thrown as `FeatureValidationError`, whose `issues` hold the field, code, row indexes, and up to 3 distinct sample values.

The stack trace starts at the `parse`/`parseRows` call, so an uncaught error points at your line, not at the library. In a terminal the stack is colored (fields, received and expected values); `message` is always plain text, and `NO_COLOR` turns colors off. Run `npm run example:bad` to see it on a messy dataset.

## Zod compatibility through Standard Schema

**Decision:** the DSL and its validator are our own, with no runtime dependencies. Compatibility with Zod, Valibot, and ArkType goes through [Standard Schema](https://standardschema.dev), the shared interface those libraries implement.

**Why not build on Zod:**

- **Different jobs.** Zod describes the *shape of a value*. The DSL describes the *meaning of a column*: its kind, its category order, and whether it needs a missing-value policy. The pipeline types inspect that meaning. Building them on Zod's internal types would couple the most delicate part of the API to a dependency, and hover types would show `ZodObject<…>` instead of readable records.
- **Tabular errors.** Zod reports one issue per value. For datasets we want issues grouped per column.
- **Missing-value semantics.** In ML, `NaN` and `null` usually mean missing. Zod rejects `NaN` in `z.number()`.

**How compatibility works:**

| Direction | Mechanism | Status |
|-----------|-----------|--------|
| TL → ecosystem | Features implement `~standard` (Standard Schema V1), so tools that accept Zod/Valibot/ArkType through Standard Schema accept them too | done |
| Zod → TL | `ml.fromSchema(schema)` reads the types from `StandardSchemaV1.InferOutput` and the categories and required fields from Standard JSON Schema (`~standard.jsonSchema`) | done |

```ts
const Penguin = z.object({
  species: z.enum(['Adelie', 'Chinstrap', 'Gentoo']),
  billLengthMm: z.number().optional(),
  notes: z.string(),
  observedAt: z.date()
})

const penguins = ml.fromSchema(Penguin, {
  notes: ml.category(['calm', 'agitated']), // required: z.string() has no categories
  observedAt: ml.timestamp() // required: JSON Schema can't represent dates
})
```

**Mapping rules:**

| Zod | TL |
|-----|----|
| `z.number()`, `z.number().int()` | `ml.number()` |
| `z.boolean()` | `ml.boolean()` |
| `z.enum([...])`, `z.literal('x')` | `ml.category([...])`, in the same order |
| `.optional()`, `.nullable()` | `.optional()` |
| anything else (`z.string()`, `z.date()`, …) | needs an override |

Fields that can't be mapped make the override **required at compile time**: leaving one out is a type error that names the missing field. An override can also replace a mapped field, for example to change the category order.

The Standard Schema interfaces are copied into `src/standard-schema.ts`, as the spec recommends, so there is no dependency on `@standard-schema/spec`. Zod is a `devDependency` used only in compatibility tests.

**Known limits:**

- A TL schema is not a Zod schema: it works where Standard Schema is accepted, but not inside `z.object({...})`.
- JSON Schema can't represent `z.date()`, and `z.iso.datetime()` validates strings, not `Date` values. Dates always need an `ml.timestamp()` override, and the data must hold `Date` instances.
- Zod's published types declare `~standard` without `jsonSchema`, even though it exists at runtime, so `fromSchema` checks for it at runtime and explains what is missing.

## Open questions

- Distinguish `optional` from `nullable`. Today `null` is accepted at runtime as missing, but the type only says `| undefined`.
- Define the `target` in the schema or in the pipeline (the README examples use the pipeline).
