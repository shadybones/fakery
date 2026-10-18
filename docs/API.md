# API reference

- [Fakery](#fakery)
  - [Fakery(ob, forcedThis)](#fakeryob-forcedthis)
  - [Fakery.on](#fakeryonfake-argsorproperty-dothis)
  - [Fakery.unwrap](#fakeryunwrapfake)
  - [Fakery.MODES and Fakery.mode](#fakerymodes-and-fakerymode)
  - [Fakery.util_eq](#fakeryutil_eqa-b)
  - [FakeObject](#fakeobject)
  - [FakeMethod and fake functions](#fakemethod-and-fake-functions)
  - [Override callbacks](#override-callbacks)
- [Catchy](#catchy)
- [Testy](#testy)

---

## Fakery

### `Fakery(ob, forcedThis)`

Wraps `ob` in a fake and returns it.

| `ob` is              | returns                                  |
|----------------------|------------------------------------------|
| an object            | a new `FakeObject` over it, faking every member |
| a function           | a new fake function (`Fakery.Function`)  |
| a FakeObject or fake function | `ob` itself                     |
| a `FakeMethod`       | its fake function                        |
| anything else        | throws `TypeError`                       |

`forcedThis` (optional) is used as `this` whenever a faked method calls through to its original.
Without it, a member of a FakeObject is called with the original object as `this`. A standalone
fake function is called with whatever `this` it was given.

`Fakery.init(ob, forcedThis)` is the same function under another name.

### `Fakery.on(fake, argsOrProperty, doThis)`

Registers an override. It dispatches on what you pass:

| `fake`                     | `argsOrProperty`     | registers                                                  |
|----------------------------|----------------------|------------------------------------------------------------|
| fake function or FakeMethod | an array            | override for calls with exactly these arguments            |
| fake function or FakeMethod | `null`              | catch-all override for every call                          |
| FakeObject                 | name of a method     | catch-all override for every call to that method           |
| FakeObject                 | name of a property   | override for reads and writes of that property             |

`doThis` may also be any value that is not a function; it is then returned as is. A member the
fake does not intercept yet (one added to the original after the fake was made, for example) is
added automatically. Throws `TypeError` on a missing fake or override, or on the wrong kind of
`argsOrProperty`. Returns nothing.

### `Fakery.unwrap(fake)`

Returns the original object or function, and turns the fake into a pass-through:

- **FakeObject:** every accessor and all bookkeeping are removed. References to the old fake now
  read and write the original through the prototype chain, and
  `Fakery.FakeObject.instanceOf(fake)` becomes false.
- **Fake function or FakeMethod:** further calls go straight to the original, without recording
  or overriding. History recorded before the unwrap is kept.

Anything that is not a fake is returned unchanged. The usual pattern is
`self = Fakery.unwrap(self)` in a test's tear-down.

### `Fakery.MODES` and `Fakery.mode`

`Fakery.MODES` is a frozen enum: `{MASK: 1, HOLLOW: 2, FULL: 3, PROPERTIES_ONLY: 4}`.
`Fakery.mode` is the global default, `MASK` to start with. Each fake has its own mode, which is 0
("inherit") until set.

The effective mode is the first non-zero of these:

- for a property: the FakeObject's mode, then `Fakery.mode`;
- for a method call: the method's mode, then its parent FakeObject's mode, then the mode of the
  FakeObject it was called on (if any), then `Fakery.mode`.

| Mode              | Property without override | Call without override  | Overrides                |
|-------------------|---------------------------|------------------------|--------------------------|
| `MASK`            | original value; writes go through | original is called | applied                |
| `HOLLOW`          | `null`; writes dropped    | returns `null`         | applied                  |
| `FULL`            | original value; writes go through | original is called | ignored                |
| `PROPERTIES_ONLY` | original value; writes go through | returns `null`     | applied to calls only    |

### `Fakery.util_eq(a, b)`

The equality used to match call arguments against overrides and `numberOfCalls(args)`:

- identical values match, and `NaN` matches `NaN`;
- arrays and plain objects (prototype `Object.prototype` or `null`) match if they have the same
  own enumerable keys and matching values, recursively; cycles are handled;
- `Date`s match by time, and `RegExp`s by source and flags;
- anything else (class instances, DOM nodes, functions) matches only itself.

### FakeObject

Created by `Fakery(object)`, or by `new Fakery.FakeObject(original, forcedThis)` (which fakes
nothing until you call `applyProperties`).

`Fakery(object)` fakes every member of the original: the `for...in` names, plus every own string
and symbol key along its prototype chain (non-enumerable ones included), except
`Object.prototype`'s members and `constructor`. Members are classified by their property
descriptors, so no getter runs while the fake is made. A data property holding a function
becomes a method; anything else, including getters and setters, becomes a property.

A FakeObject's prototype chain is `fake → proxy over a private copy of the FakeObject API →
original`. Each faked member is an own accessor on the fake. It is enumerable if the original
member is (or if the original lacks the member), so `for...in`, `Object.keys(fake)` and
`JSON.stringify(fake)` behave as on the original, and show none of Fakery's bookkeeping. A
member that is not faked is read from the original. Getters and setters then run with the
original as `this`, so DOM accessors and private class fields work. Because the chain ends in
the original, `fake instanceof Fakery.FakeObject` is false; use
`Fakery.FakeObject.instanceOf(fake)`. `fake instanceof OriginalClass` stays true.

| Method | Description |
|--------|-------------|
| `original()` | The original object. |
| `applyProperties(names)` | Fakes the members named by `names`'s enumerable keys (inherited ones included; values ignored). Skips names already faked and API names. Useful for members added to the original later, or (with `new FakeObject(original)`) to expose only some members as own properties. Returns the fake. |
| `onArgsDo(name, doThis)` | Overrides reads and writes of one member (see [callbacks](#override-callbacks)). `doThis` may be a fixed value. Works for method names too: a read of `fake.method` then returns the override's result. Throws on API names such as `"mode"`. Returns the fake. |
| `hasAction(name)` | The override registered for `name` (`{args, callback}`), or `null`. |
| `numberOfCalls(name)` | How many times the member was read through the fake. |
| `numberOfWrites(name)` | How many times it was assigned through the fake. |
| `mode()` / `mode(m)` | Gets the fake's own mode (0 = inherit), or sets it (returns the fake). Throws `RangeError` on an unknown mode. |
| `resetHistory(propagate)` | Clears the read and write counts. With `true`, also clears each faked method's history. Returns the fake. |
| `FakeObject.instanceOf(x)` | Static. Whether `x` is a live FakeObject. |

**Reads** of a faked member return, in priority order: the override's result (MASK and HOLLOW
modes); the member's fake function; `null` in HOLLOW mode; the original's value.

**Writes** to a faked member:

- go to the override, if there is one (MASK and HOLLOW modes), and stop there;
- for a method member: a fake function is installed as is, and any other function is faked and
  installed. Only the fake changes. A non-function turns the member into a plain property;
- are otherwise dropped in HOLLOW mode, and written to the original in every other mode.

### FakeMethod and fake functions

`Fakery(fn)` returns the **fake function**: a real function that can be called, constructed with
`new`, and passed anywhere `fn` was. It keeps `fn`'s `name`, `length` and `prototype`. Any other
member it lacks (a static such as `Promise.resolve`) is read from `fn`. Statics are not recorded,
and a static method runs with the fake as `this`. Its `.fake` property is the **FakeMethod**
that records calls and holds the overrides. The fake
function forwards these methods to its FakeMethod, so you can call them on either:

| Method | Description |
|--------|-------------|
| `original()` | The original function. |
| `onArgsDo(args, doThis)` | `args` is an array to match, or `null` for any call. `doThis` may be a fixed value. Registering the same `args` again replaces the override. Returns the receiver. |
| `hasAction(args)` | The override registered for exactly these `args`, or `null`. |
| `numberOfCalls(args)` | With no argument or `null`: all calls. With an array: calls whose arguments match it. |
| `mode()` / `mode(m)` | The method's own mode, as for FakeObject. |
| `resetHistory()` | Clears the recorded calls. |

FakeMethod also has these properties:

| Property | Description |
|----------|-------------|
| `history` | Array of argument arrays, oldest first. |
| `name` | The member name, or the function's name. |
| `length` | The original's declared parameter count. |
| `get()` | Returns the fake function, creating it on first use. |

**A call** to the fake function records its arguments, then returns, in priority order:

1. the result of the matching argument-specific override (any mode but FULL);
2. the result of the catch-all override (any mode but FULL);
3. `null` in HOLLOW mode (and PROPERTIES_ONLY);
4. the original's result, called with `forcedThis`, else the call's own `this`. Members of a
   FakeObject default to the original object as `this`.

`new fakeFn(...)` constructs the original (`Reflect.construct`), so faked constructors and
classes keep working, and `x instanceof fakeFn` answers as `x instanceof fn` would.

`new Fakery.FakeMethod(fn, forcedThis, parentFakeObject, name)` creates one directly.
`Fakery.Function` is the type of fake functions, for `instanceof` checks; it cannot be
constructed.

### Override callbacks

```js
function doThis(fake, args) { return result; }
```

| Registered on | `fake` | `args` | `this` | return value |
|---------------|--------|--------|--------|--------------|
| a FakeObject member | the FakeObject | `[name]` on a read, `[name, value]` on a write | the FakeObject | the read's result; ignored on a write |
| a method call | the FakeMethod (`fake.name` is the method name) | the call's arguments | the call's `this` | the call's result |

Callbacks may declare any number of parameters. Instead of a callback you may pass any value that
is not a function; it is then returned as is. To return a function, wrap it:
`() => myFunction`.

---

## Catchy

Loaded with `Catchy.js`. It installs itself on load: `then`, `catch`, `override`, `first` and
`promisify` become non-enumerable methods of every function.

| Function | Description |
|----------|-------------|
| `Catchy.wrap(fn)` | Returns the `CaughtFunction` for `fn`, without using the installed methods. Returns `fn` itself if it already is one. |
| `Catchy.install()` | Installs the methods on every function, if they are not already installed. Returns `Catchy`. |
| `Catchy.uninstall()` | Removes them. Existing CaughtFunctions keep working. Returns `Catchy`. |
| `Catchy.isInstalled()` | Whether they are installed. |
| `Catchy.defaultCatcher` | Catcher used by `.catch()` with no argument. Initially `undefined`. |
| `Catchy.CaughtFunction` | The CaughtFunction type, for `instanceof`. Calling it with `new` throws. |

`fn.then(...)`, `fn.catch(...)`, `fn.first(...)` and `fn.override(...)` on a plain function wrap
it and call the CaughtFunction method of the same name. If `fn` is also a global under its own
name (`globalThis[fn.name] === fn`), the global is replaced with the wrapper.

### CaughtFunction

A function that runs, in order:

1. each `first` hook, with the call's `this` and arguments;
2. the override if set, otherwise the original;
3. each `then` hook, with the arguments plus the result.

It returns the body's result. With `new`, it constructs the original (or the override).

**Errors.** An error from the body or a hook goes to the catcher. If the body threw, the call
returns what the catcher returns. If a hook threw, the call carries on. With no catcher, the
error is rethrown. An error thrown by the catcher itself propagates.

| Method | Description |
|--------|-------------|
| `then(dothis, onError?)` | Adds an after-hook. `onError`, if given, is set as the catcher. |
| `first(dothis)` | Adds a before-hook. |
| `catch(catcher?)` | Sets the catcher, replacing any earlier one. With no argument, uses `Catchy.defaultCatcher`. A catcher is called as `catcher(error, caught, source, args)` with the call's `this`. `source` is the function that threw. |
| `override(fn)` | Replaces the body. `override(undefined)` restores the original. |
| `promisify(bind?)` | See below. |
| `toString()` | Summary, e.g. `CaughtFunction {hasCatcher, runAfter:1, save}`. |

All except `toString` and `promisify` return the CaughtFunction. Its `__original__`,
`__before__`, `__after__`, `__catcher__` and `__override__` properties hold the configuration.

### `fn.promisify(bind?)`

Returns a function that calls `fn` (with `bind` as `this`, if given) and returns a **settled,
promise-like object** in place of a value or an exception. Its `then(onFulfilled, onRejected)`,
`catch(onRejected)` and `finally(onFinally)` run their callbacks **immediately** and return a new
settled object, so chains work. It can be awaited. It is not a native Promise. Nothing reports
a rejection that is never handled.

### Functions as promise values

Because every function gets a `then` method, promise code sees every function as a promise, and
calls `fn.then(resolve, reject)` to settle it. Catchy recognises a native promise's own
`resolve` and `reject` functions (built-in, anonymous, one parameter). Instead of wrapping, it
then resolves the promise with `fn` itself. So `await fn`, `Promise.resolve(fn)`,
`Promise.all([fn])`, and async functions or `.then` callbacks that return a function all work
as normal. Promise implementations written in JavaScript (polyfills, zone.js) pass ordinary
functions, are not recognised, and would never settle. Call `Catchy.uninstall()` in such code,
and use `Catchy.wrap`.

---

## Testy

Loaded with `Testy.js`. It installs `bindArgs` and `mute` as non-enumerable methods of every
function.

### `Testy.bindArgs(fn, list)` / `fn.bindArgs(list)`

Returns a function that calls `fn` with arguments fixed by position. Each entry of `list` that
is not `undefined` replaces the call's argument at that index. `undefined` entries let the call's
argument through, and extra call arguments are passed on. Nothing shifts (unlike
`Function.prototype.bind`), and `this` is not bound. Binding a bound function layers the lists,
with earlier bindings winning. With no `list`, `fn` is returned unchanged. Throws `TypeError` if
`list` is not array-like.

```js
function f(a, b, c) { return [a, b, c]; }
f.bindArgs([undefined, 2])("x", "y", "z");   // ["x", 2, "z"]
```

### `Testy.mute(fn)` / `fn.mute()`

Returns a function that calls `fn` with the same `this` and arguments, and returns `undefined`.
