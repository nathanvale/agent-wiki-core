# Contributing

## Versioning

A change to the base fields is a breaking change when a filed note that passed
at the old core pin fails at the new one, or when a base field means something
new. Examples:

- adding a new required base field
- renaming a base field
- narrowing the accepted value of a base field
- removing an understood base field

Every breaking change to the base fields needs a major changeset and a
consumer trial recorded in the pull request before the new core pin is
offered.

Adding an understood optional base field, or loosening a rule so previously
failing notes now pass, is a minor change.
