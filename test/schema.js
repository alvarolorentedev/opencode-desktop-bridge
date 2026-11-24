"use strict"

// The real Effect Schema is ESM-only, so the tests that evaluate the built GUI
// bundle use this small, strict stand-in. It rejects the argument shapes the
// real library rejects, such as a varargs Schema.Union.
module.exports = {
  Struct: (fields) => fields,
  String: {},
  Number: {},
  Boolean: {},
  Array: (item) => [item],
  optional: (item) => item,
  Literal: (...values) => values,
  Union: (members) => {
    if (!Array.isArray(members)) throw new Error("Schema.Union expects an array")
    return members
  },
}
