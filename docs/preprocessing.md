# Preprocessing

A transformer learns a state in `fit` using only the training data, then applies that same state to any new data.

| Transformer | Learned state                          |
|-------------|----------------------------------------|
| `missing`   | imputation value (mean, median…)       |
| `encode`    | ordered list of categories             |
| `scale`     | mean and standard deviation per column |
| `lag`       | none (stateless)                       |
| `rolling`   | none (stateless)                       |

The configuration (what the user declared) and the learned state (what `fit` produced) are distinct types.

## Missing values

Every optional field in the schema requires an explicit policy before reaching the estimator:

```ts
.missing({ age: "median" })   // "mean" | "median" | "constant" | "drop" | "error"
```

On a series, `"forward-fill"` is also available. `"mean"` and `"median"` are computed on the training fold only.

Without that policy, `.estimator()` isn't available (see [Pipeline](pipeline.md#pending-decisions)).

## Unknown categories

A category that didn't appear in training can show up in `predict`, for example when the data comes from an external source. The policy is required:

```ts
.encode("employment", { unknown: "error" })   // "error" | "ignore"
```

## Column order

The encoder stores the category order learned in `fit` and reuses that same order in `transform`. The output columns have a stable, deterministic order.

## Temporal features

Only available on `Series<F>`.

```ts
.target("close", { transform: "log-return", horizon: 1 })
.lag("close", [1, 5, 21])
.rolling("close", { window: 21, stat: "std" })   // "mean" | "std" | "min" | "max" | "sum"
```

- **`target`** defines what is predicted and how far ahead. The value at `t` is built from data at `t + horizon`, and it is the only step allowed to look forward.
- **`lag`** and **`rolling`** use only data up to `t`. With `group`, they never cross from one series into another.
- **Warm-up:** the first rows of each group don't have enough history for the lags and windows. That turns into a pending decision (`missing({ warmup: "drop" })`), not silent `NaN`s.
- **Horizon and gap:** a walk-forward `gap` smaller than the target `horizon` is a type error whenever both are known statically.

## Open questions

- What `drop` means at `predict` time: it removes the row during training, but what happens to a single prediction?
- Exponentially weighted windows (`ewm`).
- Features that cross groups (for example, a ticker's return relative to the market).
- Custom user-defined transformers.
