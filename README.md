# TL

A Machine Learning library in TypeScript, with the math implemented by hand and an API that **guides the user through the ML workflow**. Tabular data is the main use case; time series are supported from the start.

## Proposal

In libraries like scikit-learn, it is not always clear what the next step is or which decisions must be made before taking it. Many of those decisions hide behind silent defaults. This project has two goals:

1. **Learn ML by implementing the algorithms by hand**, understanding the math behind each one.
2. **Build an API that makes the workflow explicit:**
   - each step exposes only the valid next steps;
   - decisions that change the result (missing values, unknown categories, solver, regularization, split strategy) are required and have no default;
   - mistakes such as *data leakage* or pending decisions are caught at compile time whenever possible;
   - time series are considered in the design from the start: temporal splits, walk-forward validation, and look-ahead-safe features; a random split on a time series doesn't compile;
   - external data is validated at runtime.

Priorities: correctness, understanding, and interface quality. Performance comes later.

## End goal

Classifying the [Palmer Penguins](https://allisonhorst.github.io/palmerpenguins/) dataset. It has numeric and categorical fields, and some values are missing:

```ts
import { ml } from 'tl'

const penguins = ml.features({
  species: ml.category(['Adelie', 'Chinstrap', 'Gentoo']),
  island: ml.category(['Biscoe', 'Dream', 'Torgersen']),
  billLengthMm: ml.number().optional(),
  billDepthMm: ml.number().optional(),
  flipperLengthMm: ml.number().optional(),
  bodyMassG: ml.number().optional(),
  sex: ml.category(['male', 'female']).optional()
})

const data = ml.dataset(penguins, rows) // runtime validation
const { train, test } = data.split({ test: 0.2, seed: 42, stratify: 'species' })

const model = ml
  .pipeline(penguins)
  .target('species') // classification: inferred from a category
  .missing({
    billLengthMm: 'median', // required: every optional field needs a policy
    billDepthMm: 'median',
    flipperLengthMm: 'median',
    bodyMassG: 'median',
    sex: 'drop'
  })
  .encode(['island', 'sex'], { unknown: 'error' }) // required policy, no default
  .scale(['billLengthMm', 'billDepthMm', 'flipperLengthMm', 'bodyMassG'])
  .estimator(ml.knn({ k: 5, distance: 'euclidean' }))

const fitted = model.fit(train) // only accepts Train<F>
fitted.evaluate(test, [ml.accuracy, ml.confusionMatrix]) // only accepts Test<F>

fitted.predict({
  island: 'Biscoe',
  billLengthMm: 47.5,
  billDepthMm: 15.0,
  flipperLengthMm: 218,
  bodyMassG: 4950,
  sex: 'male'
}) // 'Adelie' | 'Chinstrap' | 'Gentoo'

// @ts-expect-error — evaluating on training data is leakage
fitted.evaluate(train, [ml.accuracy]) // @ts-expect-error — mse is a regression metric; `species` is a category
fitted.evaluate(test, [ml.mse])
```

### Time series

Time-ordered data uses `ml.series` and gets temporal features and walk-forward validation through the same pipeline:

```ts
const priceFeatures = ml.features({
  date: ml.timestamp(),
  ticker: ml.category(['PETR4', 'VALE3', 'ITUB4']),
  close: ml.number()
})

const prices = ml.series(priceFeatures, rows, { time: 'date', group: 'ticker' })

const model = ml
  .pipeline(prices)
  .target('close', { transform: 'log-return', horizon: 1 })
  .lag('close', [1, 5, 21]) // backward-looking only
  .missing({ warmup: 'drop' }) // required: lags leave the first rows empty
  .estimator(ml.linearRegression({ solver: 'normal-equation' }))

const report = model.backtest(
  prices,
  ml.walkForward({ train: 'expanding', test: 21, step: 21, gap: 1 })
) // @ts-expect-error — a random split on a time series is leakage
prices.split({ test: 0.2, seed: 42 })
```

> The names and signatures above show the project's direction. They are not a contract yet.

## Milestones

| #  | Milestone                       | Deliverables |
|----|---------------------------------|--------------|
| M1 | **Feature DSL**                 | Schema, `timestamp` fields, type inference, categories as literal unions, runtime validation, positive and negative type tests, Standard Schema support and `ml.fromSchema` for Zod/Valibot/ArkType schemas |
| M2 | **Dataset, split, and validation** | `dataset` and `series`; random and chronological split; walk-forward (expanding/rolling window, gap); branded `Train`/`Test` |
| M3 | **Preprocessing**               | Imputation, one-hot encoding, standardization, lag and rolling features, target horizon; learned state kept separate from configuration |
| M4 | **Linear regression**           | Prediction, MSE, gradients, gradient descent; comparison against the closed-form solution |
| M5 | **Pipeline, backtest, and metrics** | Typed composition, pending-decision checks, `fit`/`evaluate`/`predict`, `backtest` with refit per fold, MSE/MAE/R²/directional accuracy |
| M6 | **Second algorithm (MVP)**      | Logistic regression or KNN; documentation and examples |

After the MVP: purged/embargoed cross-validation, decision trees, neural networks with backpropagation, ensembles, and optimized implementations behind the same public API.

## Documentation

| Document | Contents |
|----------|----------|
| [Design principles](docs/principles.md) | Explicit decisions, time series from the start, static + runtime typing |
| [Feature DSL](docs/features.md) | Field types, inference, validation, Zod compatibility through Standard Schema |
| [Dataset and validation](docs/dataset.md) | Splits, walk-forward, branded types, leakage prevention |
| [Preprocessing](docs/preprocessing.md) | Transformers, temporal features, missing values and unknown categories |
| [Pipeline](docs/pipeline.md) | Guided workflow, configured vs. fitted model, pending decisions, backtest |
| [Estimators](docs/estimators.md) | Estimator/Predictor contracts, multiple implementations |
| [Algorithms](docs/algorithms/README.md) | Math derivation and notes for each algorithm |
| [Metrics](docs/metrics.md) | Regression, classification, and directional metrics |
| [Testing](docs/testing.md) | Numerical tests, reference oracles, type tests |

## Folder structure

```
.
├── src/
│   ├── index.ts              # public `ml` namespace
│   ├── standard-schema.ts    # Standard Schema interfaces (copied from the spec)
│   ├── features/             # schema DSL, inference, runtime validation
│   ├── dataset/              # dataset, series, Train/Test types
│   ├── validation/           # split, walk-forward, backtest folds
│   ├── preprocess/           # transformers (missing, encode, scale, lag, rolling)
│   ├── pipeline/             # guided builder, fitted model, backtest
│   ├── estimators/
│   │   ├── contracts.ts      # Estimator, Predictor, Fitted
│   │   └── linear-regression/
│   │       ├── index.ts      # public API
│   │       └── educational.ts
│   ├── metrics/
│   └── math/                 # hand-written numerical ops (vectors, matrices)
├── test/
│   ├── unit/                 # runtime and numerical tests
│   ├── types/                # type tests (expect-type, @ts-expect-error)
│   └── fixtures/             # synthetic data with known parameters
├── examples/                 # complete runnable workflows, one folder each
│   └── penguins/             # index.ts (pipeline), data.json, bad-data.json
└── docs/
    └── algorithms/
```
