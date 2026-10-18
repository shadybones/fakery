# How Fakery works

This note explains the moving parts, for anyone changing the code. For usage, see the
[README](../README.md); for the full API, see [API.md](API.md).

## Files

| File | Exports | Depends on | Side effects on load |
|------|---------|------------|----------------------|
| `src-js/Fakery.js` | `Fakery` | nothing | none |
| `src-js/Catchy.js` | `Catchy` | nothing | adds `then`/`catch`/`override`/`first`/`promisify` to every function (see below) |
| `src-js/Testy.js` | `Testy` | nothing | adds non-enumerable `bindArgs`/`mute` to `Function.prototype` |
| `src-js/main.js` | `{Fakery, Catchy, Testy}` | the three above | those of Catchy and Testy |

Each library file is one UMD-style wrapper. It defines an AMD module if `define.amd` exists,
else a CommonJS named export (`module.exports.Fakery = ...`), else a global (`window.Fakery`). The
code is strict-mode ES2015: `const`/`let`, constructor functions and explicit prototypes (the
prototype tricks below read more plainly that way than with `class`), `Proxy`, `Reflect`,
`WeakSet` and `new.target`. There is no build step; the files load as plain `<script>`s.

The three libraries are independent. They share only a convention: methods added to functions
are installed on (or under) `Function.prototype`.

## FakeObject

```
fake  ──[[Prototype]]──▶  Proxy ──target──▶ api (per-fake copy of FakeObject.prototype's methods,
 │                                             non-enumerable)  ──[[Prototype]]──▶  original object
 ├─ own accessor for each faked member ("slot"); enumerable if the original member is
 └─ hidden bookkeeping (non-enumerable):
      _f_original, _f_this, _f_methods{key→FakeMethod},
      _f_reads{key→n}, _f_writes{key→n}, _f_actions{name→{args,callback}}, _f_mode
```

- **Why a per-fake API copy?** A FakeObject needs its API methods (`onArgsDo`, `mode`...) *and*
  has to fall through to the original for anything it does not define. One prototype cannot be
  both `FakeObject.prototype` and the original, so each fake gets a small object that holds the
  API and inherits from the original. That is also why `instanceof FakeObject` is false.
  `FakeObject.instanceOf` uses a module-private `WeakSet` instead.
- **Which members.** `Fakery(object)` collects the `for...in` names plus `Reflect.ownKeys` of every
  object on the original's prototype chain, stopping at `Object.prototype` (any realm's) and
  skipping `constructor`. That covers DOM members, ES class methods and accessors, built-ins'
  non-enumerable methods (`JSON.stringify`, `Map.prototype.get`) and symbol-keyed members
  (`Symbol.iterator`). `applyProperties(copy)` fakes just the `for...in` names of `copy`.
- **Slots.** `applyMembers` defines one accessor per key. It classifies the member by its
  descriptor (found by walking the chain), so no getter runs while the fake is made. A data
  property holding a function also gets a `FakeMethod` in `_f_methods`, with the fake as its
  parent and the original (or forced `this`) as its `this`. The slot's enumerability copies the
  original member's.
- **Bookkeeping maps** are `Object.create(null)`, so member names such as `constructor`,
  `__proto__`, `push` or `length` cannot collide with anything.
- **Members that are not slots** (added to the original later, or left out of a subset fake, or
  every member after `unwrap`) are found through the prototype. A plain prototype chain would run
  an inherited getter or setter with the *fake* as `this`. Host objects reject that ("Illegal
  invocation"), and so do private class fields. So the prototype is a `Proxy` over `api`. Its
  `get` trap reads non-API keys from the original with the original as receiver. Its `set` trap
  does the same for accessors with a setter. Data writes still land on the fake, as ordinary
  JavaScript would do.

### Read path (`readSlot`)

```
count read
mode := propertyMode(fake mode || Fakery.mode)          PROPERTIES_ONLY → FULL
if mode ∈ {MASK, HOLLOW} and override exists → return callback(fake, [name])
if member is a method                         → return its fake function
if mode = HOLLOW                              → return null
return original[name]
```

### Write path (`writeSlot`)

```
count write
if mode ∈ {MASK, HOLLOW} and override exists → callback(fake, [name, value]); done
if member is a method:
    drop its FakeMethod
    value is a fake function → install it; done
    value is a function      → fake it (own mode MASK), install it; done
    otherwise the member is now a plain property; continue
if mode = HOLLOW → drop the write
else             → original[name] = value
```

## FakeMethod and the fake function

`FakeMethod` holds the state: `history`, `_f_actions` (an array of `{args, callback}`, where
`args` is an array or `null`), `_f_mode`, `_f_parent`, `_f_this`. `get()` lazily builds the
callable **wrapper**:

- its prototype is a `Proxy` whose target inherits from `Fakery.Function.prototype` (and so from
  `Function.prototype`). Keys found there resolve normally, so the wrapper forwards
  `onArgsDo`, `numberOfCalls`, `mode`, `resetHistory`, `hasAction` and `original` to the
  FakeMethod, and keeps `call`, `apply` and `bind`. Any other key is read from the original
  function, so statics such as `Promise.resolve` or `Array.isArray` keep working;
- `.fake` points back to the FakeMethod;
- `name`, `length` and `prototype` are copied from the original.

### Call path

```
if unwrapped → call original
record a copy of the args in history
mode := methodMode(own || parent || this-if-FakeObject || Fakery.mode)   PROPERTIES_ONLY → HOLLOW
if mode ≠ FULL:
    entry := override matching args, else the catch-all (null) override
    if entry → return entry.callback.call(this, fakeMethod, args)
    if mode = HOLLOW → return null
new.target ? Reflect.construct(original, args, …) : original.apply(forcedThis ?? this, args)
```

Arguments are matched with `argsEqual` (exported as `Fakery.util_eq`). It compares arrays and
plain objects structurally, with a cycle guard, and everything else by identity, so DOM nodes in
the arguments are never walked.

## Catchy

```
any function ──▶ Function.prototype ──▶ functionMethods {then, catch, override, first, promisify}
                                         ──▶ (what Function.prototype inherited before; normally Object.prototype)

caught (a CaughtFunction) ──▶ CaughtFunction.prototype {then, catch, override, first, promisify, toString}
                              ──▶ Function.prototype ──▶ …
```

`install()` splices `functionMethods` into the chain right above `Function.prototype`, and
`uninstall()` takes it out again. The methods on `functionMethods` just call
`CaughtFunction(this)`, which wraps a plain function (or returns an existing CaughtFunction),
and then forward to the method of the same name. The wrapper keeps its configuration in own
properties: `__original__`, `__before__`, `__after__`, `__catcher__`, `__override__`.

Because `functionMethods.then` exists, every function is a thenable while Catchy is installed.
Native promise code settles a thenable by calling `x.then(resolve, reject)` with its own
built-in resolving functions. Those are anonymous, take one parameter, and print as
`[native code]`. Both `then` implementations (on `functionMethods` and on
`CaughtFunction.prototype`) check for that pair first. On a match, they set `resolvingAsValue =
fn` and call `resolve(fn)`. `then` is defined as an accessor whose getter returns `undefined`
for `resolvingAsValue`, so the promise's synchronous `Get(fn, "then")` finds no `then`. It
fulfils with `fn` itself instead of looping. Promise implementations written in JavaScript pass
ordinary functions, which is what `uninstall()` and `wrap()` are for.

## Tests

`src-test/` holds the owner's small harness:

- `test-asserts.js` provides `assert`, `assertEquals`, `assertThrows` and `assert.group`;
- `test.html` loads the libraries, then each `<Name>.test.js`, and renders the results;
- `run-node.js` recreates the globals the harness provides (`test`, `_test<Name>`, the libraries
  and the asserts), so the same suite files run under Node with `npm test`.

Each suite file is an IIFE that receives its test object, records results, and calls `done()`,
possibly later: Catchy's promise checks finish asynchronously, and the Node runner waits up to
five seconds for each suite.
Groups that need a real DOM run only when `window` and `document` exist.
