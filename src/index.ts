import {
  boolean,
  category,
  features,
  number,
  timestamp
} from './features/index.ts'

export const ml = Object.freeze({
  features,
  number,
  boolean,
  category,
  timestamp
})

/** The record type described by a `Features` schema. */
export type Infer<F extends { readonly infer: unknown }> = F['infer']

export type {
  AnyField,
  BooleanField,
  CategoryField,
  FeatureIssue,
  Features,
  IssueCode,
  NumberField,
  Shape,
  TimestampField
} from './features/index.ts'
export { FeatureValidationError } from './features/index.ts'
export type { StandardSchemaV1 } from './standard-schema.ts'
