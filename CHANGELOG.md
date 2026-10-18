# Changelog

## Unreleased (2026 clean-up)

A review and clean-up of the 2015–2017 code. It added documentation, tests that run under Node
and in the browser harness, and the fixes below. Some fixes change behaviour, so the next
release should be **0.2.0**, not 0.1.2.

### Improvements

- **`Fakery(object)` fakes every member, not only enumerable ones.** That covers ES class methods
  and getters, built-in methods (`JSON.stringify`, `Map.prototype.get`, array methods) and
  symbol-keyed members (`Symbol.iterator`), stopping at `Object.prototype`. Before, faking a
  class instance intercepted only its fields. Calling its methods through the fake ran them with
  the fake as `this`, which threw for private fields (`#token`) and for built-ins ("Method
  Map.prototype.get called on incompatible receiver"). `fake.applyProperties({stringify: 1})`
  is no longer needed for JSON.
- Members are classified by their descriptors, so no getter runs while a fake is made. An
  accessor that happens to return a function (such as `onclick`) stays a property instead of
  being wrapped as a method. Each faked member keeps the original's enumerability, so
  `Object.keys(fake)` and `JSON.stringify(fake)` match the original.
- **Members a fake does not intercept now work.** Getters and setters run with the original as
  `this`, so DOM accessors no longer throw "Illegal invocation". This applies to members added to
  the original later, members left out of a subset fake, and any member after `Fakery.unwrap`.
- **Fake functions keep the original's statics.** `Fakery(Promise).resolve`,
  `Fakery(Array).isArray` and your own static methods are readable through the fake; `new this()`
  inside a static goes through the fake.
- **Fixed return values.** Any override argument that is not a function is returned as is:
  `fake.onArgsDo("title", "Test")`, `fakeFn.onArgsDo(["id"], null)`, `Fakery.on(fake, "x", 0)`.
- **Catchy no longer breaks native promises.** With Catchy installed, `await fn`,
  `Promise.resolve(fn)`, `Promise.all([fn])`, and async functions returning a function used to
  hang forever, because every function had a `then` method. Catchy now recognises a native
  promise's resolve and reject functions, and settles the promise with the function itself.
  (Promise implementations written in JavaScript are not recognised; see the README.)
- `onArgsDo`, `mode(m)` and `resetHistory` return the fake, so calls can be chained.
- The code uses `const`/`let` and arrow functions where they help. `.gitignore` lists what it
  ignores, instead of ignoring every dotfile.

### Behaviour changes

- **Catch-all method overrides now apply in MASK mode.** `fake.method.onArgsDo(null, cb)` and
  `Fakery.on(fake, "method", cb)` used to call `cb` but discard its result in MASK mode (the
  default). Only HOLLOW mode used it. The examples and the mode descriptions both expected the
  result to be returned, so it now is. An argument-specific override still wins over the
  catch-all, and the catch-all is no longer also called when a specific override matched. In
  FULL mode no override runs at all.
- **Overridden property writes no longer write into the original.** A write to a property with
  an override used to store the callback's return value on the original object. The callback
  now just receives the write. Before, a callback written for reads (e.g. returning a fake
  document) could leak into the real object, such as real `localStorage`.
- **Assigning a function to a faked method replaces it on the fake only.** Before, it overwrote
  the method on the original object. The replacement is faked too, so its calls are recorded.
- **Catchy rethrows errors when no catcher is set.** Before, an error in a wrapped function was
  silently swallowed, and the call returned `undefined`, even with only a `then` hook. An error
  thrown by a catcher now propagates instead of being swallowed. When the body throws, the call
  returns the catcher's return value.
- **Invalid modes throw** (`RangeError`) instead of being ignored. `PROPERTIES_ONLY` can now be
  set per fake; before, only the global setting accepted it.
- **HOLLOW mode, and a method replaced with a non-function value:** the member now behaves like
  any other property in that mode. Before, it was forced to write through to the original.
- **Strict mode.** The libraries now run in strict mode, so writing a read-only property of the
  original through a fake throws, as it does in strict code.
- **Exports.** Each file still exports a named member (`require(".../Fakery").Fakery`).
  `require("fakery-js")` now returns `{Fakery, Catchy, Testy}`; before, each was nested one
  level too deep (`.Fakery.Fakery`). Browser globals are now only `Fakery`, `Catchy` and
  `Testy`; the stray `FakeObject` and `FakeMethod` globals are gone (use `Fakery.FakeObject`).
- **Catchy's installed methods** now sit on an object above `Function.prototype` instead of on
  the `Catchy` object itself. Functions no longer inherit Catchy's settings. New:
  `Catchy.wrap`, `Catchy.install`, `Catchy.uninstall`, `Catchy.isInstalled` and
  `Catchy.CaughtFunction`.
- **`promisify`** now returns a properly chaining, synchronously settled thenable. Before, it
  ignored callback return values, threw if `then` had no error handler, and leaked the globals
  `result` and `prom`.
- `Fakery.unwrap(fakeFunction)` leaves the old wrapper working as a pass-through. Before, it
  stripped the FakeMethod, so a later call threw.
- `FakeObject.state()` and `FakeMethod.state()` are removed. They referred to `Fakery.State`,
  which was deleted in 2015, so they always threw.

### Fixes

Fakery:

- Faking an object with a method named `push`, `length`, `indexOf` or `splice` (a jQuery object,
  for example) threw or misbehaved: the method table was an array, also used as a map.
- Replacing one method on a fake removed every method registered after it (`splice(i)` instead
  of `splice(i, 1)`).
- Overriding a member named after something on `Object.prototype` (such as `"constructor"`) set
  a property on the global `Object` constructor, and the override was lost.
- `Fakery.on(fake, "methodName", cb)` did nothing. The override was stored as a property
  override, which the method slot ignored.
- A method of a FakeObject ignored its parent's mode when called detached
  (`var f = fake.method; f()`). The parent link was never set.
- A falsy catch-all result (`0`, `""`, `false`) was turned into `null` in HOLLOW mode.
- Re-applying a method (`applyProperties`) replaced its FakeMethod, losing its overrides and
  history.
- Overriding a member the original does not enumerate (such as `window.JSON`) had no effect
  unless `applyProperties` was called first.
- `Fakery.on` and `onArgsDo` rejected callbacks that did not declare exactly two parameters.
- Argument matching recursed forever on cyclic arguments. It could walk the whole DOM when DOM
  nodes were passed. It treated every two Dates (or RegExps) as equal. `NaN` never matched.
- `new fake.SomeClass()` threw "cannot be invoked without 'new'", because faked constructors
  could not be constructed. This also broke `new self.Image()` after `self = Fakery(self)`.
- Fake functions had `length` 0 and the name `"fxn"`; they now keep the original's.
- A host getter that throws while faking (e.g. `localStorage` in a sandboxed frame) made
  `Fakery(window)` throw.
- Fakery's own bookkeeping was enumerable, so `JSON.stringify(fake)` and `Object.keys(fake)`
  showed it. Stringifying a fake of `window` even threw on the cycle.
- `FakeMethod` instances were not `instanceof Fakery.Fake`, because the inheritance was wired
  between the constructors rather than the prototypes.
- The FakeObject constructor's branch for non-function prototype members would have thrown
  (it called `__defineGetter__` on `undefined`).

Catchy:

- A wrapped function always received **no arguments**: `[].splice.apply(arguments)` returned an
  empty array. For example, `add.then(log)(1, 2)` returned `NaN`.
- Wrapping threw `ReferenceError: window is not defined` outside a browser.
- `fn.then(dothis, onError)` dropped `onError` when called on a plain function.
- Wrapping a constructor broke `new`.
- `caught.catch()` with no argument did not use `Catchy.defaultCatcher`, unlike `fn.catch()`.

Testy:

- `fn.bindArgs(a).bindArgs(b)` dropped the first binding. Binding a Catchy-wrapped function
  bypassed its hooks.
- `fn.bindArgs()` with no list returned `undefined`.
- `bindArgs` and `mute` were enumerable on every function, as were Catchy's methods.
- A stray sample function, `myFunction`, became a global when the file was loaded in a browser.
  The doc-comment test idea it illustrated is now described in the file header.

Tests and packaging:

- `npm test` pointed to `Stately.test.js`, a file from another repository. It now runs this
  repository's suites under Node.
- The browser harness (`src-test/test.html`) loaded the libraries from the wrong folder, and
  loaded Stately, which is not part of this repository. Scripts could run out of order, and
  `#autorun` crashed before running anything.
- `test-asserts.js`: comparing `null` with an object threw, object comparison depended on key
  order, `assertEquals(x, undefined)` was treated as a chained assertion, and a failed assertion
  crashed under Node (`self` is not defined there).
- Removed `gruntfile.js` and the unused `grunt`, `grunt-contrib-uglify` and `js-observables` dev
  dependencies. The gruntfile came from js-observables and minified a file that does not exist
  here. Removed `dist/` from `files`, since nothing builds it.
- Examples fixed: the JsTestDriver example faked `getElementsByName` while the code under test
  calls `getElementsByTagName`, and read `self.JSON` after setting it to null. The feature tour
  claimed values that no single mode produces. A Catchy and Testy example was added.
- The Node runner waits for suites that finish asynchronously (the Catchy promise checks).

## 0.1.1 (2017-12-07)

Added AMD and CommonJS exports, `main.js`, `package.json`, Testy, and the browser test harness.
Published to npm as `fakery-js`.

## 2015

Fakery and Catchy written and used in browser tests (JsTestDriver).
