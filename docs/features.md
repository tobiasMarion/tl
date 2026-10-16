# Feature DSL

The DSL defines the data schema using only the library. Users don't need to import Zod or any other validator; if the library uses one, it stays an internal detail.

```ts
const features = ml.features({
  age: ml.number().optional(),
  income: ml.number(),
  employment: ml.category(['employed', 'unemployed', 'self-employed']),
  ownsHome: ml.boolean()
})

type Features = typeof features.infer
// {
//   age?: number | undefined
//   income: number
//   employment: 'employed' | 'unemployed' | 'self-employed'
//   ownsHome: boolean
// }
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

## Open questions

- Distinguish `optional` from `nullable`, or treat them the same way.
- Define the `target` in the schema or separately.
- Use an internal validation dependency or write our own.
