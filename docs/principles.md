# Design principles

## Explicit decisions

When a decision changes the model's result, the user has to make it. The library has no silent defaults for:

- missing values;
- unknown categories in `predict`;
- solver and regularization;
- split strategy.

If a required decision is pending, that is a **compile-time error**. When it can't be detected statically, it is a runtime error that says what still needs to be decided.

## Time series from the start

Tabular data is the main use case, but time series (financial data, for example) are considered in the design from day zero, not bolted on later. Temporal data has its own type (`Series<F>`). Only that type gets lag/rolling features and walk-forward validation, and it can't be split randomly. Any operation that could use information from the future is either impossible to write or a pending decision.

## The API shows the next step

Each step of the workflow exposes only the methods that make sense there, so autocomplete works as a guide. Error messages say what the next step is, not just what went wrong.

## Static and runtime validation

TypeScript types don't guarantee that external data is correct. So the library combines:

- **static guarantees** for known contracts (schema, pipeline composition, `Train`/`Test`);
- **runtime validation** for external inputs (CSV, APIs);
- **internal conversion** to numerical representations.

We don't try to encode in the types matrix dimensions, convergence state, or anything else that is only known at runtime.

## Separate data representations

1. **Raw records:** typed objects with named fields.
2. **Prepared records:** data after imputation, encoding, and standardization.
3. **Numerical representation:** arrays and typed arrays used by the algorithms.

The internal representation doesn't dictate the public interface.

## Type quality

- No `any` and no broad casts that just silence incompatibilities.
- Targeted casts are acceptable at runtime boundaries, as long as a validation or invariant justifies them.
- Type tests run in CI (see [Testing](testing.md)).

## Scope control

A few solid algorithms with excellent DX are worth more than a shallow catalog. The project's biggest risk is the type architecture eating up the time before a single algorithm works. To avoid that, we keep an end-to-end workflow working from early on and grow it in small increments.
