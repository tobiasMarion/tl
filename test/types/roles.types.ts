import type { Test, Train, Validation } from '../../src/dataset/roles.ts'
import type { NumberField } from '../../src/features/fields.ts'

type P = { x: NumberField }
declare const train: Train<P>
declare const validation: Validation<P>
declare const test: Test<P>

// A block keeps its own role
const _sameRole: Train<P> = train

// @ts-expect-error — a test block can't be used for training
const _testAsTrain: Train<P> = test

// @ts-expect-error — a training block isn't a test block
const _trainAsTest: Test<P> = train

// @ts-expect-error — validation and test aren't interchangeable
const _validationAsTest: Test<P> = validation

// @ts-expect-error — validation and test aren't interchangeable
const _testAsValidation: Validation<P> = test

// @ts-expect-error — only the library can create a block
const _literal: Train<P> = { rows: [] }
