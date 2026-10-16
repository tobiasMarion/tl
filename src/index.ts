import {
  boolean,
  category,
  features,
  fromSchema,
  number,
  orderedCategory,
  timestamp
} from './features/index.ts'

export const ml = Object.freeze({
  features,
  fromSchema,
  number,
  boolean,
  category,
  orderedCategory,
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
  Optional,
  OrderedCategoryField,
  RequiredField,
  Shape,
  TimestampField
} from './features/index.ts'
export { FeatureValidationError } from './features/index.ts'
export type { StandardSchemaV1 } from './standard-schema.ts'
