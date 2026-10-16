# Pipeline

The pipeline is a guided builder: each method returns a new type, and that type exposes only the valid next steps.

```ts
const model = ml
  .pipeline(features)
  .missing({ age: 'median' })
  .encode('employment', { unknown: 'error' })
  .scale(['age', 'income'])
  .estimator(ml.linearRegression({ solver: 'normal-equation' }))

const fitted = model.fit(train)
```

## Workflow

```
features ─► pipeline ─► missing / encode / scale ─► estimator ─► fit ─► evaluate / predict
```

`fit` does the following:

1. fits the transformers on the training data;
2. transforms the training data;
3. fits the estimator;
4. stores the learned states.

`predict` reapplies the same transformations to the new record and only then predicts.

## Pending decisions

The pipeline carries in its type the set of fields that still lack a decision (for example, optional fields without a missing-value policy). `.estimator()` only exists when that set is `never`:

```ts
interface Pipeline<F, Pending extends keyof F> {
  estimator<E extends Estimator>(
    this: Pipeline<F, never>,
    e: E
  ): ConfiguredModel<F, E>
}
```

The error message has to name the pending field. The ergonomics of that message are part of the contract.

## Configured vs. fitted model

- `ConfiguredModel`: holds the configuration and has `fit`.
- `FittedModel`: holds the learned states and has `predict`, `evaluate`, and `describe`.

`fit` doesn't mutate the configured model; it returns a new value.

## Backtest

On a `Series<F>`, `model.backtest(series, splitter)` runs the whole pipeline once per walk-forward fold:

1. fits the transformers and the estimator on the fold's `Train<F>`;
2. predicts the fold's `Test<F>`;
3. stores the predictions and metrics for that fold.

The result reports metrics per fold and aggregated, along with the out-of-sample predictions as a series. Nothing learned in one fold leaks into another.

## Incompatible composition

If a step references a field that doesn't exist or has the wrong type (for example, `scale` applied to a category), the composition fails at compile time. The same goes for temporal steps (`lag`, `rolling`, `target` with a `horizon`) on a pipeline built from a `Dataset<F>` instead of a `Series<F>`.

## Open questions

- Synchronous or asynchronous `fit`.
- Branching steps (the equivalent of `ColumnTransformer`).
- `describe()`: the output format.
