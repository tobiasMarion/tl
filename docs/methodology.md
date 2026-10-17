# Methodological errors

The project's conjecture is that well-typed functions prevent methodological errors: mistakes that leave the code running but make the reported score better than the model really is. This document lists those errors, records which ones the library catches and how, and describes how to measure whether that matters.

## The errors

The categories follow the leakage taxonomy of Kapoor & Narayanan, *Leakage and the reproducibility crisis in machine-learning-based science* (Patterns, 2023), extended with errors in model selection and evaluation (Cawley & Talbot, *On over-fitting in model selection and subsequent selection bias in performance evaluation*, JMLR, 2010) and in time series (López de Prado, *Advances in Financial Machine Learning*, 2018).

Each error gets a status:

| Status | Meaning |
|--------|---------|
| **compile** | The wrong code doesn't compile. |
| **runtime** | The wrong code throws at the call, with a message that names the fix. |
| **by design** | There is no way to write it: the API does it the right way. |
| **required** | The user has to write the decision down; there is no default. |
| **opt-in** | A tool avoids it, but the default code doesn't use it and nothing warns. |
| **silent** | The wrong code runs and reports a score. |
| **out of scope** | Depends on what the data means, which no type can see. |

*Today* is the state of `main`. *Planned* names the milestone that changes it; a dash means nothing is planned. Every status of *Today* other than silent has a test with its ID in [`test/methodology/`](../test/methodology/).

### Train and test aren't separate

| ID | Error | Today | Planned |
|----|-------|-------|---------|
| S1 | Training on the test block, or evaluating on the training block | compile (roles) | compile at `fit`/`evaluate` (M5) |
| S2 | Splitting the test block again, to carve validation out of it | compile | — |
| S3 | Choosing hyperparameters or models by their test score | silent | compile: the search only sees `Train` (M6) |
| S4 | Fitting preprocessing (imputation, scaling, encoding) on all the data before the split | silent | compile: transformers fit on `Train` (M3, M5) |
| S5 | Selecting features with all the data before the split | silent | — |
| S6 | Oversampling before the split, so copies of a row land in both blocks | silent | — |
| S7 | The same record in train and test | silent | — |

S1 is already caught by the types: a `Test` isn't assignable to `Train`. Nothing consumes a block until M5, which is why the planned column repeats it.

### Train and test aren't independent

| ID | Error | Today | Planned |
|----|-------|-------|---------|
| T1 | Random split of a time series | compile, runtime | — |
| T2 | Time series split in the order the rows arrived, not by time | by design (`ml.series` sorts) | — |
| T3 | Rows of several series stacked as one, so a time repeats | runtime (`duplicate_time`) | — |
| T4 | No gap between train and test, so the last training labels look into the test period | required (`gap`) | — |
| T5 | A gap shorter than the target's horizon | silent | compile or runtime against the target horizon (M5) |
| T6 | Panel data cut at a different time per series, so one series trains on a period another is tested on | by design (one cut for every group) | — |
| T7 | Features computed with future values, such as a centered rolling mean | silent | by design: lag and rolling only look back (M3) |
| T8 | The same entity (patient, user) in train and test | silent | opt-in: group k-fold (after the MVP) |

### Evaluation

| ID | Error | Today | Planned |
|----|-------|-------|---------|
| E1 | A split that can't be repeated, so a lucky one can't be told apart | required (`seed`) | — |
| E2 | A metric that doesn't match the target, such as MSE on class labels | — | compile (M5) |

### Data

| ID | Error | Today | Planned |
|----|-------|-------|---------|
| D1 | Invalid values read silently: unknown categories, impossible dates such as `'2025-02-30'` | runtime | — |
| D2 | Missing values filled or dropped by a default nobody chose | runtime (required fields) | required policy per optional field (M3) |

### Out of scope

The types can't see these, so the library claims nothing about them:

- **Illegitimate features** (Kapoor & Narayanan's L2): a feature that is a proxy for the target, such as the discharge date when predicting mortality.
- **A test set from the wrong population** (L3.3): the test rows don't represent where the model will be used.
- **Repeating the experiment until the test looks good**: every run is correct on its own; the error is in how many runs there were.
- **Survivorship and revised data**: a series that only has the companies that still exist, or values corrected after the fact.

## How we measure it

The matrix above is the first of three steps. Each answers a different question.

1. **Coverage: which errors can be written?** The matrix, with one test per status. It is deterministic and cheap, and it shows which errors still pass silently, so it guides the design of the next milestones.
2. **Effect: do people who use the library make fewer of them?** An experiment with coding agents, once a model can be trained and evaluated end to end (after M5). Each task has errors planted in it and a hidden holdout the agent never sees, and the outcome is the **reported score minus the score on the holdout**: errors show up as optimism, without having to classify solutions by hand. Three arms separate the causes:
   - scikit-learn, as the reference;
   - this library in plain JavaScript, without `tsc`: the same API and runtime checks, no types;
   - this library with `tsc` in the agent's loop.

   The difference between the last two is the effect of the types. Also recorded: how often agents escape the types with casts, how many finish the task, and how many iterations it takes. The hypotheses and the metric are registered before the runs, so the experiment doesn't commit the error it measures.
3. **Do the results hold for people?** Agents read every error message and do what it says, so they likely overstate the effect. A small study with people on the same tasks checks it.
