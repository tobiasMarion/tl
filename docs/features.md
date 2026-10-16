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
- Mark optional or nullable fields in the type, so the pipeline [requires a policy](preprocessing.md#missing-values) for them.
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

Optional fields become optional keys that also accept `undefined` (`age?: number | undefined`), because the project uses `exactOptionalPropertyTypes`.

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
| Zod → TL | `ml.fromSchema(schema)` reads the types from `StandardSchemaV1.InferOutput` and the categories and required fields from Standard JSON Schema (`~standard.jsonSchema`) | planned |

The Standard Schema interface is copied into `src/standard-schema.ts`, as the spec recommends, so there is no dependency on `@standard-schema/spec`.

## Open questions

- Distinguish `optional` from `nullable`, or treat them the same way.
- Define the `target` in the schema or separately.
