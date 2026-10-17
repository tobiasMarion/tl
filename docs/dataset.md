# Dataset and validation

## Dataset and series

- `ml.dataset(features, rows)`: rows have no meaningful order.
- `ml.series(features, rows, { time, group? })`: rows are ordered by `time`. `group` identifies independent series in panel data (for example, one series per ticker).

`time` must be a required `timestamp` field and `group` a required `category` field: a row without a time has no place in the series, and a row without a group belongs to no series. A wrong field is a type error that lists the valid ones.

`series` sorts the rows by `time`, and rows at the same time by the order of the `group` categories in the schema. The input order carries no information beyond the timestamps, so sorting changes no result, and the same rows give the same series in any order. Timestamps are milliseconds since 1970 (see [timestamps](features.md#runtime-validation)).

Both validate the records against the schema at runtime, once, at the entry point. The dataset, its rows, and each record are frozen; the caller's rows are left untouched. `series` also rejects a time that repeats within a group (or anywhere, without a group), with a `FeatureValidationError` whose `duplicate_time` issue lists the rows. Times are compared as instants: `'2025-01-01T03:00:00Z'` and `'2025-01-01T00:00:00-03:00'` repeat.

The two are distinct types, and each one exposes only the splits that make sense for it.

## Train, validation, and test

Three *branded* types: they have the same shape but aren't interchangeable.

| Type            | Used for                                                       |
|-----------------|----------------------------------------------------------------|
| `Train<F>`      | fitting transformers and the estimator                         |
| `Validation<F>` | comparing models and hyperparameters during development        |
| `Test<F>`       | the final estimate, after every choice has been made           |

Without a validation set, the only way to compare models is to look at the test set, and then the test score stops being an honest estimate: the chosen model is the one that got lucky on it.

**Roles are assigned once; training data can be resampled:**

- `split` exists only on the original data. It assigns every row a role, once, and its blocks can't be split again;
- [splitters](#folds) (`kFold`, `walkForward`) estimate performance by resampling. They accept the original data or a `Train<F>`, and on a `Train<F>` each fold holds out a `Validation<F>`;
- a `Validation<F>` or a `Test<F>` can't be split or resampled. That is a compile-time error.

So a validation block always comes from training data, and nothing built from a `Train<F>` can reach the `Test<F>`.

| Operation              | Accepts                    |
|------------------------|----------------------------|
| `model.fit(...)`       | `Train<F>`                 |
| `fitted.evaluate(...)` | `Validation<F>`, `Test<F>` |
| `fitted.predict(...)`  | typed record `F`           |

## Random split

Only on `Dataset<F>`.

```ts
const { train, test } = data.split({ test: 0.2, seed: 42 })
const { train, validation, test } = data.split({
  validation: 0.15,
  test: 0.15,
  seed: 42
})
```

- **`stratify`:** `{ ..., stratify: 'species' }` keeps the proportion of each category in every block. Only required `category` and `orderedCategory` fields are accepted: an optional one would need a decision about missing values. With imbalanced classes, a split without it can leave a class almost absent from the test set. Blocks keep the sizes they would have without `stratify`; each class gets its share of a block by the largest remainder method, so rounding per class doesn't make the block larger than asked for.
- The returned blocks follow the options: `validation` only exists when it was asked for.
- `test` and `validation` are fractions of the whole dataset, rounded up; `train` gets the rest.
- The test block is cut first. With the same `seed` and `test`, adding or changing `validation` keeps the same test block, so validation choices can be compared against a fixed test set.
- The options are checked at the call: fractions must be in (0, 1) and leave rows for training after rounding, and `seed` must be an integer from 0 to 2³²−1. Anything else throws a `RangeError`. With `stratify`, the field must be a required category (a `TypeError` lists the valid ones), and each class needs at least one row per block (a `RangeError` names the class).

A random split doesn't exist on `Series<F>`. Shuffling time-ordered data leaks the future into training.

## Chronological split

Only on `Series<F>`. Blocks follow time order: train, then validation, then test.

```ts
const { train, test } = prices.split({ testFrom: '2025-01-01', gap: { steps: 1 } })
const { train, validation, test } = prices.split({
  validationFrom: '2024-07-01',
  testFrom: '2025-01-01',
  gap: { steps: 1 }
})
```

- **`testFrom`, `validationFrom`:** rows at or after `testFrom` are test; rows from `validationFrom` until `testFrom` are validation; earlier rows are train. They accept the same inputs as `ml.timestamp()` (a `Date`, milliseconds, or an ISO 8601 string read as UTC without an offset), and a cut can fall between two times of the series.
- **`gap`:** rows dropped before each held-out block, so no training label reaches into it. A target that looks 5 steps ahead (`'will the price go up in the next 5 days?'`) needs at least 5: the label of the last training row would otherwise be computed from held-out prices. The unit is part of the value, with no default:
  - `{ steps: n }` drops the last `n` distinct times before the cut. For targets defined in observations, such as trading days, where weekends don't count.
  - `{ duration: ms }` drops every row less than `ms` before the cut. For targets defined in calendar time, or for irregular series where `n` rows can be minutes or days.
  - `{ steps: 0 }` means no gap, and has to be written down.
- The gap applies before every cut and to every earlier row. With a `group`, steps count distinct times across the whole series, so every series loses the same times and they all share the same cut.
- A block left empty, a `validationFrom` that isn't before `testFrom`, or an invalid `testFrom` or `gap` throws at the call, with the series' time span in the message.

Rows are counted in neither unit: with a `group`, one row of one ticker isn't a meaningful amount of time.

## k-fold

Only on `Dataset<F>`. The data is shuffled with `seed` and cut into `k` folds; each fold is held out once while the others train.

```ts
ml.kFold({ k: 5, seed: 42 })
ml.kFold({ k: 5, seed: 42, stratify: 'species' })
```

```
fold 1  [held out][train ────────────────────]
fold 2  [train ───][held out][train ─────────]
fold 3  [train ────────────][held out][train ]
...
```

Every row is held out exactly once, so the whole dataset contributes to the estimate. It is the counterpart of walk-forward for data without order. On a `Series<F>` it doesn't exist: blocks after the held-out one would train on the future.

## Walk-forward

Only on `Series<F>`.

```ts
ml.walkForward({
  train: 'expanding', // or { window: 504 }
  test: 21,
  step: 21,
  gap: { steps: 1 }
})
```

```
fold 1  [train ─────────]·[test]
fold 2  [train ────────────────]·[test]
fold 3  [train ───────────────────────]·[test]
                                 ^ gap
```

- **`train`:** an expanding window keeps all history; a rolling window keeps the last N periods.
- **`test`:** the size of each held-out block.
- **`step`:** how far the window moves between folds.
- **`gap`:** periods dropped between train and the held-out block (embargo). It has to cover at least the target horizon, otherwise the last training labels overlap the held-out period.

With `group`, all groups share the same time cut, so no ticker sees a period that is in another ticker's held-out block.

## Folds

`kFold` and `walkForward` are splitters: they don't hold data, they describe how to cut it. Applied to data they produce one pair per fold, following the same role rule as `split`:

| Splitter applied to          | Each fold                     |
|------------------------------|-------------------------------|
| the original data            | `Train<F>` / `Test<F>`        |
| a `Train<F>`                 | `Train<F>` / `Validation<F>`  |

The transformers and the estimator are refit on every fold (see [Pipeline](pipeline.md#backtest)).

### Nested validation

Because splitters compose, nested cross-validation is just folds inside folds: an outer splitter estimates how good the whole process is, and an inner one, applied to each outer `Train<F>`, chooses hyperparameters.

```
outer fold 1: [ outer train ──────────────── ][test]
                └─ inner folds on the outer train:
                   [train ──────][valid.]   k = 3?
                   [train ──][valid.][───]  k = 5?
                → best choice, refit on the whole outer train, evaluate on test
outer fold 2: ...
```

Picking hyperparameters with cross-validation and reporting that same score is optimistic: the winner is the configuration that got lucky on those folds. With nested validation the choice only ever sees inner validation blocks, and the outer test blocks measure the process including the choice. Each outer fold may choose differently; the result is an estimate of "run this search, then train", not a single best value.

M2 provides the composable splits and their type rules. The search API that runs the inner loop (for example `ml.search({ k: [3, 5, 7] }, { inner: ml.kFold({ k: 5, seed: 42 }) })`) depends on the pipeline and comes with the first algorithm that has a real hyperparameter (M6).

## Required decisions

- Split strategy and its parameters. There is no default `test` or `validation` size, no default `k`, and no default window.
- `seed` for random splits and k-fold.
- `gap` for temporal splits, with its unit (`{ steps }` or `{ duration }`). `{ steps: 0 }` is allowed, but it has to be written down explicitly.

## After the MVP

- **Purged and embargoed k-fold** (López de Prado): k-fold on a series, with the held-out block in the middle. *Purge* drops training rows whose label overlaps the held-out period (a 5-day return label computed with prices inside it); *embargo* drops training rows right after the held-out block, whose `lag`/`rolling` features were computed from it. It uses the whole series for testing, which helps with short histories, at the cost of training on data later than the test. It needs each label's horizon and each feature's time footprint.
- **Group k-fold:** rows of the same group (for example, the same patient) never appear on both sides of a fold.

## Open questions

- Whether `Test<F>` gets its own final-evaluation API instead of sharing `evaluate` with `Validation<F>`, to make "evaluate on test once, at the end" explicit.
- Whether `stratify` should be a required decision for classification targets.
- Time units for walk-forward `window`, `step`, and `test`: the chronological split settles `gap` as `{ steps }` or `{ duration }`, and walk-forward should follow it. Calendar periods with variable length (`'1M'`) are still open.
