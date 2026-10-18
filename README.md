# Fakery

Test doubles for **live** JavaScript objects. Wrap a real object (`document`, `window`,
`localStorage`, one of your own modules) in a fake. Override only the members a unit test cares
about, and record every read, write and call. Everything you do not override still reaches the
real object.

```js
const fakeDoc = Fakery(document);
fakeDoc.getElementById.onArgsDo(["my-id"], function () { return { src: "hi.js" }; });

fakeDoc.getElementById("my-id");        // { src: "hi.js" }
fakeDoc.getElementById("anything-else"); // whatever the real document returns
fakeDoc.getElementById.numberOfCalls(); // 2
```

Fakery is not a test runner. Use it inside tests run by Jasmine, Mocha, QUnit, Karma or anything
else. Two small helper libraries ship with it:

- **Catchy**: before/after hooks, body overrides and error catching for any function.
- **Testy**: fix a function's arguments by position, or mute its return value.

## The problem it solves

Browser globals such as `document`, `navigator` and `location` cannot be replaced:
`window.document = fake` does nothing. So making `document.getElementById("my-id")` return a test
object for one test, while the rest of the page keeps working, is awkward.

Fakery's answer has two parts:

1. **A fake that defaults to the real thing.** `Fakery(document)` is an object whose members
   forward to the real document, except the ones you override. Methods are called with the real
   object as `this`, so DOM methods do not throw "Illegal invocation".
2. **The `self` swap.** In a page `self === window`, and unlike `window.document`, `self` *can* be
   reassigned. Code that reaches globals through `self` (`self.document.getElementById(...)`) uses
   the real window in production. A test points it at a fake:

```js
// Code under test
function getMyElementsSrcAttribute() {
    return self.document.getElementById("my-id").src;
}

// Test
const fakeDoc = Fakery(document);
fakeDoc.getElementById.onArgsDo(["my-id"], function () { return { src: "hi.js" }; });
self = Fakery(self);
Fakery.on(self, "document", function () { return fakeDoc; });
try {
    assertEquals("hi.js", getMyElementsSrcAttribute());
} finally {
    self = Fakery.unwrap(self);   // back to the real window
}
```

## Loading it

The libraries are plain JavaScript files with no dependencies and no build step. Each one works
as a browser global, an AMD module or a CommonJS module. They need an ES2015 runtime (any current
browser or Node version).

```html
<script src="src-js/Fakery.js"></script>  <!-- window.Fakery -->
<script src="src-js/Catchy.js"></script>  <!-- window.Catchy (patches functions, see below) -->
<script src="src-js/Testy.js"></script>   <!-- window.Testy (patches functions, see below) -->
```

```js
// npm install --save-dev fakery-js
const { Fakery, Catchy, Testy } = require("fakery-js");    // all three
const { Fakery } = require("fakery-js/src-js/Fakery");    // Fakery alone, with no side effects
import { Fakery } from "fakery-js";                        // ES modules work too (Node, bundlers)
```

AMD loaders get the named modules `"Fakery"`, `"Catchy"` and `"Testy"`.

## Core ideas

### Fakes

| You fake...  | `Fakery(x)` returns                                | It records                                     |
|--------------|----------------------------------------------------|------------------------------------------------|
| an object    | a **FakeObject**: same members, same values        | reads and writes of each member                |
| a function   | a **fake function** (`Fakery.Function`)            | every call's arguments (`fakeFn.fake.history`) |

A FakeObject covers every member of the original: own and inherited, enumerable or not (so
ES class methods, getters and `Map`/`Array` methods too). Only `Object.prototype`'s members are
left out. Methods and getters run against the real object, so DOM methods and private class
fields keep working. Each method is itself a fake function:
`fakeDoc.getElementById.numberOfCalls()`. A fake function keeps the original's statics (a faked
`Promise` still has `resolve`). Faking a fake returns it unchanged.

### Overrides

An override is a callback whose return value replaces a read or a call. It is called with
`(fake, args)`, and `this` is the receiver of the read or call. Any value that is not a function
is used as a fixed return value: `fake.onArgsDo("title", "Test title")`.

```js
// A property: args is [name] for a read, or [name, value] for a write
fake.onArgsDo("title", function (fake, args) { return "Test title"; });

// A method, for specific arguments
fake.getElementById.onArgsDo(["my-id"], function (method, args) { return testElement; });

// A method, for any arguments (catch-all)
fake.getElementById.onArgsDo(null, function (method, args) { return null; });

// Fakery.on does either, by what you pass it
Fakery.on(fake, "title", callback);                  // property override
Fakery.on(fake, "getElementById", callback);         // catch-all for the method
Fakery.on(fake.getElementById, ["my-id"], callback); // argument-specific
```

For a method call, an argument-specific override beats the catch-all, and the catch-all beats
the original. Arguments are matched by value for arrays, plain objects, Dates and RegExps, and by
identity for everything else, including DOM nodes and class instances (see `Fakery.util_eq`).

### Modes

The mode decides what happens to members that have no override. Set it globally with
`Fakery.mode = Fakery.MODES.X`, or per fake with `fake.mode(Fakery.MODES.X)`. A method uses its
own mode, then its object's, then the global one.

| Mode              | Members you did not override                      | Overrides  |
|-------------------|---------------------------------------------------|------------|
| `MASK` (default)  | behave as the original                            | applied    |
| `HOLLOW`          | read as `null`; calls return `null`; writes dropped | applied  |
| `FULL`            | behave as the original                            | ignored: the fake only records |
| `PROPERTIES_ONLY` | properties as the original; method calls return `null` | applied to methods only |

### Writes

- A write to an overridden property goes to the callback. The original is not changed.
- Assigning a function to a faked method replaces it **on the fake only**, and the new function's
  calls are recorded too.
- Any other write goes through to the original in `MASK`, `FULL` and `PROPERTIES_ONLY` modes, and
  is dropped in `HOLLOW` mode.

### Inspecting and resetting

```js
fake.numberOfCalls("title");           // reads of a property
fake.numberOfWrites("title");          // writes of a property
fakeFn.numberOfCalls();                // all calls
fakeFn.numberOfCalls(["my-id"]);       // calls with these arguments
fakeFn.fake.history;                   // [[...args of call 1], [...args of call 2], ...]
fake.resetHistory(true);               // clear counts (true: also each method's history)
Fakery.unwrap(fake);                   // returns the original; the fake becomes a pass-through
```

## Catchy

```js
function save(record) { /* ... */ }

const watched = save                                                   // or Catchy.wrap(save)
    .first(function (record) { validate(record); })                  // before each call
    .then(function (record, result) { console.log("saved", result); }) // after each call
    .catch(function (error, caught, source, args) { return null; })   // errors -> return value
    .override(function (record) { return "stubbed"; });              // swap the body
```

The first method called on a plain function wraps it in a `CaughtFunction`. Each method returns
that same wrapper, so calls chain. If the original is a global under its own name (a top-level
function in a browser script), the global is replaced with the wrapper too. Without a
catcher, errors are rethrown as normal. `fn.promisify()` returns a version of `fn` that hands
back a synchronously settled, promise-like result.

> **Catchy and promises.** Catchy gives every function a `then` method, and promises treat
> anything with `then` as a promise. Catchy detects native promises asking (for `await fn`,
> `Promise.resolve(fn)`, or an async function returning a function), and hands them the function
> itself, so those work. Promise implementations written in JavaScript (polyfills, or zone.js in
> Angular apps) are not detected, and would wait forever. With those, call `Catchy.uninstall()`
> and use `Catchy.wrap(fn)`. `Catchy.install()` puts the methods back.

## Testy

```js
function area(w, h, unit) { return w * h + " " + unit; }
area.bindArgs([undefined, undefined, "m2"])(3, 4);  // "12 m2": fixes arguments by position
area.mute()(3, 4, "m2");                            // undefined: same call, no return value
Testy.bindArgs(area, [2]);                          // the same helpers, without the installed methods
```

## Limitations

- **Members are found when the fake is made.** A member added to the original later is still
  readable through the fake, but is not intercepted until you override it (or call
  `applyProperties`).
- **Statics of a fake function are read, not recorded.** `fakeFn.someStatic(...)` calls the
  original's static with the fake as `this`, so `new this()` inside it goes through the fake.
- **Reserved names.** A FakeObject's own API (`original`, `mode`, `onArgsDo`, `hasAction`,
  `numberOfCalls`, `numberOfWrites`, `resetHistory`, `applyProperties`) hides members of the same
  name on the original.
- **The `self` swap needs code that uses `self`.** Code that writes plain `document` or
  `window.document` cannot be redirected this way.

## Documentation

- [docs/API.md](docs/API.md): full API reference for Fakery, Catchy and Testy.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how the fakes work inside, and how the files fit together.
- [examples/](examples/): the `self` swap, a feature tour, a JsTestDriver test case, Catchy and Testy.
- [CHANGELOG.md](CHANGELOG.md): what changed in the 2026 clean-up.

## Running the tests

```bash
npm test
```

That runs the suites in `src-test/` under Node. To run them in a browser, serve the repository
folder and open `src-test/test.html#autorun`. The browser run adds checks against the real
`document` and `window`.

## Project layout

```
src-js/Fakery.js      the fakes (FakeObject, FakeMethod, Fakery.Function, modes)
src-js/Catchy.js      CaughtFunction and the methods it installs on functions
src-js/Testy.js       bindArgs and mute
src-js/main.js        CommonJS entry: re-exports all three
src-test/             test-asserts.js, test.html (browser harness), run-node.js, *.test.js
examples/             usage examples
docs/                 API reference and architecture notes
```

## Status

Written in 2015–2017, and cleaned up in 2026. That pass fixed the bugs listed in the changelog,
and added tests and these docs. Published on npm as `fakery-js` (0.1.1 is the 2017 code).

## License

The repository's [LICENSE](LICENSE) file is the Mozilla Public License 2.0, but `package.json`
(and the published npm package) says MIT. These need reconciling.
