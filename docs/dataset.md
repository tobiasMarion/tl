# Dataset and validation

## Dataset and series

- `ml.dataset(features, rows)`: rows have no meaningful order.
- `ml.series(features, rows, { time, group? })`: rows are ordered by `time`. `group` identifies independent series in panel data (for example, one series per ticker).

Both validate the records against the schema at runtime, once, at the entry point. `series` also checks that timestamps are valid and that there are no duplicates within a group.

The two are distinct types, and each one exposes only the splits that make sense for it.

## Split with branded types

```ts
// Dataset<F>
const { train, test } = data.split({ test: 0.2, seed: 42 })

// Series<F>
const { train, test } = series.split({ until: "2024-12-31", gap: 1 })
```

Both return `Train<F>` and `Test<F>`. These are *branded* types: they have the same shape but aren't interchangeable.

| Operation              | Accepts          |
|------------------------|------------------|
| `model.fit(...)`       | `Train<F>`       |
| `fitted.evaluate(...)` | `Test<F>`        |
| `fitted.predict(...)`  | raw record `F`   |

A random split (`{ test, seed }`) doesn't exist on `Series<F>`. Shuffling time-ordered data leaks the future into training.

## Walk-forward

```ts
ml.walkForward({
  train: "expanding",   // or { window: 504 }
  test: 21,
  step: 21,
  gap: 1,
})
```

```
fold 1  [train ─────────]·[test]
fold 2  [train ────────────────]·[test]
fold 3  [train ───────────────────────]·[test]
                                 ^ gap
```

- **`train`:** an expanding window keeps all history; a rolling window keeps the last N periods.
- **`test`:** the size of each test block.
- **`step`:** how far the window moves between folds.
- **`gap`:** periods dropped between train and test (embargo). It has to cover at least the target horizon, otherwise the last training labels overlap the test period.

Each fold produces a `Train<F>`/`Test<F>` pair. The transformers and the estimator are refit on every fold (see [Pipeline](pipeline.md#backtest)).

With `group`, all groups share the same time cut, so no ticker sees a period that is in another ticker's test set.

## Required decisions

- Split strategy and its parameters. There is no default `test` size and no default window.
- `seed` for random splits.
- `gap` for temporal splits. `0` is allowed, but it has to be written down explicitly.

## Open questions

- Purged and embargoed k-fold cross-validation (López de Prado).
- Stratified split for classification.
- A separate validation set (`train` / `validation` / `test`) for hyperparameter tuning inside each fold.
- Time units for `window`, `step`, and `gap`: rows, or calendar periods (`"1M"`)?
