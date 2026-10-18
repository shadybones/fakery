/**
 * @file Fakery: test doubles for live JavaScript objects and functions.
 *
 * Fakery wraps a real object or function in a "fake" that looks and behaves like the original,
 * but lets a test:
 *   - override what chosen properties return, or what a method returns for chosen arguments;
 *   - hide the original (HOLLOW mode), or only watch it (FULL mode);
 *   - read back how often each property was read or written, and every argument list a method got.
 *
 * It was written for browser unit tests. Globals such as `document`, `navigator` and `location`
 * cannot be replaced, so code under test reaches them through `self` (`self.document...`), and a
 * test replaces `self` with `Fakery(self)`. The test overrides only what it needs; everything else
 * still reaches the real object.
 *
 * How the pieces fit together:
 *   Fakery(object)    -> FakeObject: an object whose prototype chain ends in the original object.
 *                        Each member of the original (own or inherited, except Object.prototype's)
 *                        gets an accessor on the fake. Each method also gets a FakeMethod.
 *   Fakery(function)  -> Fakery.Function: a callable wrapper. Its `.fake` is the FakeMethod that
 *                        records calls and decides what each call returns.
 *   onArgsDo / on     -> register an override ("action") on a fake.
 *   Fakery.MODES      -> decide what members without an override do: pass through to the original,
 *                        return null, or just record.
 *
 * Loads as a browser global (`Fakery`), an AMD module ("Fakery") or a CommonJS module
 * (`require(".../Fakery").Fakery`). Needs an ES2015 runtime.
 */
(function (root, factory) {
    "use strict";
    const Fakery = factory();
    if (typeof define === "function" && define.amd) {
        define("Fakery", [], () => Fakery);
    } else if (typeof module === "object" && module.exports) {
        module.exports.Fakery = Fakery;
    } else {
        root.Fakery = Fakery;
    }
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";

    const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
    const isString = (value) => typeof value === "string" || value instanceof String;

    /**
     * Defines a non-enumerable, writable and configurable data property. Fakery keeps its own
     * bookkeeping in these, so it stays out of `for...in`, `Object.keys` and `JSON.stringify`.
     */
    function defineHidden(target, key, value) {
        Object.defineProperty(target, key, { value: value, writable: true, configurable: true, enumerable: false });
    }

    /** Every live FakeObject. Lets FakeObject.instanceOf answer exactly, whatever the original is. */
    const fakeObjects = new WeakSet();


    /**
     * Wraps `ob` in a fake. Faking a fake returns it unchanged.
     *
     * @param {Object|Function} ob The object or function to fake.
     * @param {Object=} forcedThis Used as `this` whenever a faked method calls through to its
     *     original. If omitted, a member of a FakeObject uses the original object, and a
     *     standalone fake function uses whatever `this` it was called with.
     * @returns {Fakery.FakeObject|Fakery.Function}
     * @throws {TypeError} If `ob` is missing or is not an object or function.
     */
    function Fakery(ob, forcedThis) {
        return Fakery.init(ob, forcedThis);
    }

    /**
     * What a fake does with members that have no override. Set it globally with `Fakery.mode`,
     * or per fake with `fake.mode(...)`.
     *
     *  MASK            Overridden members are overridden; everything else reaches the original.
     *                  This is the default.
     *  HOLLOW          Overridden members are overridden; everything else is hidden. Reads return
     *                  null, writes are dropped, and method calls return null without calling the
     *                  original.
     *  FULL            Nothing is overridden, and overrides are ignored. The fake only records reads,
     *                  writes and calls.
     *  PROPERTIES_ONLY Properties behave as in FULL (real values, overrides ignored). Methods behave
     *                  as in HOLLOW (only overridden calls return something).
     *
     * @enum {number}
     */
    Fakery.MODES = Object.freeze({ MASK: 1, HOLLOW: 2, FULL: 3, PROPERTIES_ONLY: 4 });
    const MODES = Fakery.MODES;

    /**
     * Global default mode. A fake or method whose own mode is 0 (unset) uses its parent's mode,
     * and falls back to this.
     * @type {number}
     */
    Fakery.mode = MODES.MASK;

    /** @throws {RangeError} unless `mode` is 0 (unset) or one of Fakery.MODES. */
    function checkMode(mode) {
        const valid = Object.keys(MODES).some((key) => MODES[key] === mode);
        if (mode !== 0 && !valid) {
            throw new RangeError("invalid mode " + mode + "; use 0 (inherit) or one of Fakery.MODES");
        }
    }
    /** Mode that governs property reads and writes. PROPERTIES_ONLY acts as FULL for properties. */
    function propertyMode(mode) {
        return mode === MODES.PROPERTIES_ONLY ? MODES.FULL : mode;
    }
    /** Mode that governs method calls. PROPERTIES_ONLY acts as HOLLOW for methods. */
    function methodMode(mode) {
        return mode === MODES.PROPERTIES_ONLY ? MODES.HOLLOW : mode;
    }

    /**
     * Turns what was passed as an override into a callback. A function is used as is. Any other
     * value except undefined becomes a callback that returns that value.
     * @throws {TypeError} If `doThis` is undefined.
     */
    function toCallback(doThis, caller) {
        if (typeof doThis === "function") {
            return doThis;
        }
        if (doThis === undefined) {
            throw new TypeError(caller + ": a callback, or a value to return, is required");
        }
        return function () { return doThis; };
    }


    /**
     * Registers an override on a fake.
     *
     *  - Fake function, or FakeMethod: `argsOrProperty` is an array of arguments to match, or null
     *    to match any call. The callback's return value is what the call returns.
     *  - FakeObject, with the name of a method: the callback handles every call to that method,
     *    like `fake.method.onArgsDo(null, doThis)`.
     *  - FakeObject, with the name of a property: the callback handles reads and writes of that
     *    property, like `fake.onArgsDo(name, doThis)`.
     *
     * @param {Fakery.FakeObject|Fakery.Function|Fakery.FakeMethod} fake Something returned by Fakery.
     * @param {Array|string|null} argsOrProperty Arguments to match, null, or a member name.
     * @param {(Fakery.ActionCallback|*)} doThis Produces the result of the overridden access or
     *     call. Any value that is not a function is returned as is.
     * @throws {TypeError} On a missing fake or override, or an argument of the wrong type.
     */
    Fakery.on = function on(fake, argsOrProperty, doThis) {
        if (!fake) {
            throw new TypeError("Fakery.on(fake, argsOrProperty, doThis) needs a fake");
        }
        doThis = toCallback(doThis, "Fakery.on");
        if (fake instanceof FakeryFunction) {
            fake = fake.fake;
        }
        if (FakeObject.instanceOf(fake) && isString(argsOrProperty)) {
            const name = String(argsOrProperty);
            const method = methodFor(fake, name);
            if (method) {
                method.onArgsDo(null, doThis);
            } else {
                fake.onArgsDo(name, doThis);
            }
            return;
        }
        if (fake instanceof FakeMethod && (Array.isArray(argsOrProperty) || argsOrProperty === null)) {
            fake.onArgsDo(argsOrProperty, doThis);
            return;
        }
        throw new TypeError("Fakery.on: use an array or null for a fake function, and a member name for a fake object");
    };

    /**
     * Creates the fake. See {@link Fakery}.
     * @param {Object|Function} ob
     * @param {Object=} forcedThis
     * @returns {Fakery.FakeObject|Fakery.Function}
     */
    Fakery.init = function init(ob, forcedThis) {
        if (!ob) {
            throw new TypeError("Fakery needs an object or function to fake");
        }
        if (FakeObject.instanceOf(ob) || ob instanceof FakeryFunction) {
            return ob;
        }
        if (ob instanceof FakeMethod) {
            return ob.get();
        }
        if (typeof ob === "function") {
            return new FakeMethod(ob, forcedThis).get();
        }
        const fake = new FakeObject(ob, forcedThis);
        applyMembers(fake, memberKeys(ob));
        return fake;
    };

    /**
     * Turns a fake back into a pass-through and returns the original.
     *
     *  - FakeObject: its accessors and bookkeeping are removed, so any reference to it now reads
     *    and writes the original through the prototype chain.
     *  - Fake function: it now calls the original directly, without recording or overriding.
     *    Its recorded history is kept.
     *
     * Anything that is not a fake is returned unchanged.
     *
     * @param {Fakery.FakeObject|Fakery.Function|Fakery.FakeMethod|*} fake
     * @returns {*} The original object or function.
     */
    Fakery.unwrap = function unwrap(fake) {
        if (fake instanceof FakeryFunction) {
            fake = fake.fake;
        }
        if (fake instanceof FakeMethod) {
            fake._f_unwrapped = true;
            return fake.original();
        }
        if (FakeObject.instanceOf(fake)) {
            const original = fake.original();
            Reflect.ownKeys(fake).forEach((key) => {
                delete fake[key];
            });
            fakeObjects.delete(fake);
            return original;
        }
        return fake;
    };

    /**
     * Produces the result of an overridden access or call. It is called with `this` set to the
     * receiver of the access or call.
     *
     * @callback Fakery.ActionCallback
     * @param {(Fakery.FakeObject|Fakery.FakeMethod)} fake The fake that was accessed or called.
     * @param {Array} args For a FakeMethod: the call's arguments. For a FakeObject: `[name]` for a
     *     read, or `[name, value]` for a write. The return value of a write is ignored.
     * @returns {*} What the read or call returns.
     */

    /**
     * An override registered with onArgsDo.
     * @typedef {{args: (Array|string|null), callback: Fakery.ActionCallback}} Fakery.ActionEntry
     */


    /**
     * The interface that FakeObject and FakeMethod both implement. Fake functions forward the
     * same methods to their FakeMethod.
     * @interface
     */
    function Fake() {}
    /**
     * @returns {Object|Function} The original object or function that was faked.
     */
    Fake.prototype.original = function () {};
    /**
     * Registers an override. The callback's return value is what the access or call returns; a
     * value that is not a function is returned as is. Registering again for the same property or
     * arguments replaces the earlier override.
     * @param {(Array|string|null)} argsOrProperty A FakeObject takes a member name. A FakeMethod
     *     takes an array of arguments to match, or null to match any call.
     * @param {(Fakery.ActionCallback|*)} doThis
     * @returns {Fakery.Fake} this, for chaining.
     * @throws {TypeError} On invalid arguments.
     */
    Fake.prototype.onArgsDo = function (argsOrProperty, doThis) {};
    /**
     * @param {(Array|string|null)} argsOrProperty
     * @returns {?Fakery.ActionEntry} The override registered for exactly these arguments or this
     *     property, or null.
     */
    Fake.prototype.hasAction = function (argsOrProperty) {};
    /**
     * A FakeObject counts reads of a property (writes are counted by numberOfWrites). A FakeMethod
     * counts calls whose arguments match `args`, or all calls if `args` is null or omitted.
     * @param {(Array|string|null)=} argsOrProperty
     * @returns {number}
     * @throws {TypeError} On an argument of the wrong type.
     */
    Fake.prototype.numberOfCalls = function (argsOrProperty) {};
    /**
     * Gets or sets this fake's own mode, which takes precedence over Fakery.mode. With no
     * argument it returns the current value; 0 means "inherit".
     * @param {number=} mode 0 or one of Fakery.MODES.
     * @returns {(number|Fakery.Fake)} The mode when getting, or this when setting.
     * @throws {RangeError} On an unknown mode.
     */
    Fake.prototype.mode = function (mode) {};
    /**
     * Clears recorded history: reads and writes for a FakeObject, calls for a FakeMethod.
     * @param {boolean=} propagate FakeObject only: also clear the history of its methods.
     * @returns {Fakery.Fake} this
     */
    Fake.prototype.resetHistory = function (propagate) {};


    /**
     * A stand-in for a real object. Create one with `Fakery(object)`, which fakes every member of
     * the original. `new Fakery.FakeObject(object)` fakes nothing until you call applyProperties.
     *
     * Prototype chain: fake -> (proxy over) a private copy of FakeObject.prototype -> original.
     * Each faked member is an accessor on the fake: reads and writes through it are counted and
     * routed by mode and overrides. A member that was not faked (one added to the original later,
     * for example) is read from the original. A getter or setter runs with the original as `this`,
     * so DOM accessors and class getters that use private fields still work.
     *
     * Because the chain ends in the original, `fake instanceof Fakery.FakeObject` is false. Use
     * `Fakery.FakeObject.instanceOf(fake)` instead.
     *
     * @constructor
     * @implements {Fakery.Fake}
     * @param {Object} originalObject The object being faked.
     * @param {Object=} originalThis Forced `this` for the fake's methods. Defaults to originalObject.
     * @throws {TypeError} If originalObject is not an object, or is already a fake.
     */
    function FakeObject(originalObject, originalThis) {
        if (originalObject === null || typeof originalObject !== "object" || FakeObject.instanceOf(originalObject)) {
            throw new TypeError("FakeObject needs an object that is not already a fake");
        }
        if (originalThis != null && typeof originalThis !== "object" && typeof originalThis !== "function") {
            throw new TypeError("FakeObject: originalThis must be an object");
        }

        defineHidden(this, "_f_original", originalObject);
        defineHidden(this, "_f_this", originalThis);
        /** FakeMethods for the faked methods, by member key. */
        defineHidden(this, "_f_methods", Object.create(null));
        /** Read counts by member key. */
        defineHidden(this, "_f_reads", Object.create(null));
        /** Write counts by member key. */
        defineHidden(this, "_f_writes", Object.create(null));
        /** Overrides by member name. @type {Object<string, Fakery.ActionEntry>} */
        defineHidden(this, "_f_actions", Object.create(null));
        /** Own mode; 0 means "use Fakery.mode". */
        defineHidden(this, "_f_mode", 0);

        // The fake's prototype holds a private copy of the FakeObject API and inherits from the
        // original, so anything the fake does not define is found on the original. The proxy
        // makes such lookups use the original as the receiver: inherited getters and setters
        // would otherwise run with the fake as `this`, which host objects reject ("Illegal
        // invocation") and private class fields cannot be read from.
        const api = Object.create(originalObject);
        Object.getOwnPropertyNames(FakeObject.prototype).forEach((name) => {
            if (name !== "constructor") {
                defineHidden(api, name, FakeObject.prototype[name]);
            }
        });
        Object.setPrototypeOf(this, new Proxy(api, {
            get(target, key, receiver) {
                return hasOwn(target, key) ? Reflect.get(target, key, receiver) : Reflect.get(originalObject, key);
            },
            set(target, key, value, receiver) {
                if (!hasOwn(target, key)) {
                    const descriptor = findDescriptor(originalObject, key);
                    if (descriptor && descriptor.set) {
                        return Reflect.set(originalObject, key, value);
                    }
                }
                return Reflect.set(target, key, value, receiver);
            }
        }));
        fakeObjects.add(this);
    }

    /**
     * @param {*} item
     * @returns {boolean} Whether `item` is a live FakeObject.
     */
    FakeObject.instanceOf = function instanceOf(item) {
        return item !== null && typeof item === "object" && fakeObjects.has(item);
    };

    /** FakeObject API names cannot be faked: an accessor would hide the API method. */
    function isReserved(key) {
        return key !== "constructor" && hasOwn(FakeObject.prototype, key);
    }

    /** The descriptor of `key` on `object` or the nearest prototype that has it, or undefined. */
    function findDescriptor(object, key) {
        try {
            for (let o = object; o !== null; o = Object.getPrototypeOf(o)) {
                const descriptor = Object.getOwnPropertyDescriptor(o, key);
                if (descriptor) {
                    return descriptor;
                }
            }
        } catch (crossOrigin) {
            // A cross-origin window or frame can refuse to describe itself.
        }
        return undefined;
    }

    /** Whether `o` is some realm's Object.prototype, whose members Fakery leaves alone. */
    function isObjectPrototype(o) {
        return o === Object.prototype ||
            Object.getPrototypeOf(o) === null && hasOwn(o, "isPrototypeOf") && hasOwn(o, "propertyIsEnumerable");
    }

    /**
     * Every member key of `object` that Fakery(object) fakes: the `for...in` names, plus every own
     * string and symbol key along the prototype chain (non-enumerable ones, such as ES class
     * methods and JSON.stringify), stopping at Object.prototype. `constructor` is left alone.
     */
    function memberKeys(object) {
        const keys = [];
        const seen = new Set();
        const add = (key) => {
            if (!seen.has(key)) {
                seen.add(key);
                keys.push(key);
            }
        };
        for (const name in object) {
            add(name);
        }
        try {
            for (let o = object; o !== null && !isObjectPrototype(o); o = Object.getPrototypeOf(o)) {
                Reflect.ownKeys(o).forEach((key) => {
                    if (key !== "constructor") {
                        add(key);
                    }
                });
            }
        } catch (crossOrigin) {
            // Keep the names found so far.
        }
        return keys;
    }

    /**
     * Fakes the given members, skipping keys already faked and FakeObject API names. A data member
     * holding a function becomes a method with its own FakeMethod; anything else (including
     * getters and setters) becomes a property. Members are classified by their descriptors, so
     * no getter runs here. Each accessor on the fake is enumerable if the original member is, or
     * if the original lacks the member.
     */
    function applyMembers(fake, keys) {
        keys.forEach((key) => {
            if (isReserved(key) || hasOwn(fake, key)) {
                return;
            }
            const descriptor = findDescriptor(fake._f_original, key);
            const value = descriptor && descriptor.value;
            if (typeof value === "function") {
                fake._f_methods[key] = value instanceof FakeryFunction
                    ? value.fake // already a fake function: reuse it
                    : new FakeMethod(value, fake._f_this || fake._f_original, fake, keyName(key));
            }
            defineSlot(fake, key, descriptor ? descriptor.enumerable : true);
        });
    }

    /** A readable name for a member key: symbols as "[description]", like their methods' names. */
    function keyName(key) {
        return typeof key === "symbol" ? "[" + (key.description || "") + "]" : key;
    }

    /**
     * Fakes the members named by the enumerable properties of `copy`, including inherited ones.
     * Only the names in `copy` matter; the values come from the original. A name the original
     * lacks is still faked, and reads as undefined until it is overridden.
     *
     * Fakery(object) already fakes every member, so this is mostly for two cases:
     *  - faking members added to the original after the fake was made;
     *  - building a fake that exposes only some members as own properties. Use
     *    `new Fakery.FakeObject(original).applyProperties({a: 1, b: 1})`; then `Object.keys` and
     *    `JSON.stringify` see only `a` and `b`. Other members are still readable; they are just
     *    not intercepted.
     *
     * Names already faked, and FakeObject API names, are skipped.
     *
     * @param {Object} copy An object whose property names select the members to fake.
     * @returns {Fakery.FakeObject} this
     */
    FakeObject.prototype.applyProperties = function applyProperties(copy) {
        if (copy) {
            const names = [];
            for (const name in copy) {
                names.push(name);
            }
            applyMembers(this, names);
        }
        return this;
    };

    FakeObject.prototype.original = function original() {
        return this._f_original;
    };

    FakeObject.prototype.hasAction = function hasAction(property) {
        return isString(property) && this._f_actions[String(property)] || null;
    };

    /**
     * Overrides reads and writes of one member. The callback gets `[name]` on a read and
     * `[name, value]` on a write. A read returns what the callback returns; a write is swallowed,
     * so the original is not changed. This applies in MASK and HOLLOW modes.
     *
     * This works for method names too: a read of `fake.method` returns what the callback returns,
     * which lets a test make an API look missing. To override calls to a method instead, use
     * `fake.method.onArgsDo(...)` or `Fakery.on(fake, "method", ...)`.
     *
     * @param {string} property
     * @param {(Fakery.ActionCallback|*)} doThis A callback, or a value to return as is.
     * @returns {Fakery.FakeObject} this
     * @throws {TypeError} On a missing name or override.
     * @throws {Error} If `property` is a FakeObject API name such as "mode".
     */
    FakeObject.prototype.onArgsDo = function onArgsDo(property, doThis) {
        if (!isString(property) || String(property) === "") {
            throw new TypeError("FakeObject.onArgsDo: a property name is required, got " + String(property));
        }
        const callback = toCallback(doThis, "FakeObject.onArgsDo");
        const name = String(property);
        if (isReserved(name)) {
            throw new Error("FakeObject.onArgsDo: \"" + name + "\" is a FakeObject method and cannot be overridden");
        }
        const entry = this._f_actions[name];
        if (entry) {
            entry.callback = callback;
        } else {
            this._f_actions[name] = { args: name, callback: callback };
        }
        applyMembers(this, [name]);
        return this;
    };

    FakeObject.prototype.numberOfCalls = function numberOfCalls(property) {
        if (!isString(property)) {
            throw new TypeError("FakeObject.numberOfCalls: a property name is required, got " + String(property));
        }
        return this._f_reads[String(property)] || 0;
    };

    /**
     * @param {string} property
     * @returns {number} How many times the property was assigned through the fake.
     * @throws {TypeError} If `property` is not a string.
     */
    FakeObject.prototype.numberOfWrites = function numberOfWrites(property) {
        if (!isString(property)) {
            throw new TypeError("FakeObject.numberOfWrites: a property name is required, got " + String(property));
        }
        return this._f_writes[String(property)] || 0;
    };

    FakeObject.prototype.mode = function mode(newMode) {
        if (newMode == null) {
            return this._f_mode;
        }
        checkMode(newMode);
        this._f_mode = newMode;
        return this;
    };

    FakeObject.prototype.resetHistory = function resetHistory(propagate) {
        this._f_reads = Object.create(null);
        this._f_writes = Object.create(null);
        if (propagate) {
            Reflect.ownKeys(this._f_methods).forEach((key) => {
                this._f_methods[key].resetHistory();
            });
        }
        return this;
    };

    /**
     * Returns the FakeMethod behind a FakeObject's method, faking the member first if needed
     * (one added to the original after the fake was made, for example).
     * @returns {?FakeMethod} null if the member is not a method.
     */
    function methodFor(fake, name) {
        applyMembers(fake, [name]);
        return fake._f_methods[name] || null;
    }

    /** Defines the accessor that intercepts reads and writes of one member of a FakeObject. */
    function defineSlot(fake, key, enumerable) {
        Object.defineProperty(fake, key, {
            configurable: true,
            enumerable: enumerable,
            get: function () { return readSlot(fake, key); },
            set: function (value) { writeSlot(fake, key, value); }
        });
    }

    /**
     * Read of a faked member. Priority: an override (MASK and HOLLOW only), then the member's
     * FakeMethod, then null in HOLLOW mode, then the original's value.
     */
    function readSlot(fake, key) {
        fake._f_reads[key] = (fake._f_reads[key] || 0) + 1;
        const mode = propertyMode(fake._f_mode || Fakery.mode);
        if (mode === MODES.MASK || mode === MODES.HOLLOW) {
            const entry = fake._f_actions[key];
            if (entry) {
                return entry.callback.call(fake, fake, [key]);
            }
        }
        const method = fake._f_methods[key];
        if (method) {
            return method.get();
        }
        if (mode === MODES.HOLLOW) {
            return null;
        }
        return fake._f_original[key];
    }

    /**
     * Write of a faked member. An override (MASK and HOLLOW only) takes the write and nothing is
     * stored. Assigning a function to a method replaces the method on the fake only; the new
     * function is itself faked, so its calls are recorded too. Any other write is dropped in
     * HOLLOW mode, and otherwise goes through to the original.
     */
    function writeSlot(fake, key, value) {
        fake._f_writes[key] = (fake._f_writes[key] || 0) + 1;
        const mode = propertyMode(fake._f_mode || Fakery.mode);
        if (mode === MODES.MASK || mode === MODES.HOLLOW) {
            const entry = fake._f_actions[key];
            if (entry) {
                entry.callback.call(fake, fake, [key, value]);
                return;
            }
        }
        if (fake._f_methods[key]) {
            delete fake._f_methods[key];
            if (value instanceof FakeryFunction) {
                value = value.fake;
            } else if (typeof value === "function") {
                // An explicit replacement should run whatever the global mode is, so it gets MASK.
                value = new FakeMethod(value, fake._f_this, fake, keyName(key)).mode(MODES.MASK);
            }
            if (value instanceof FakeMethod) {
                fake._f_methods[key] = value;
                return;
            }
            // Not a function: from now on the member is an ordinary property.
        }
        if (mode === MODES.HOLLOW) {
            return;
        }
        fake._f_original[key] = value;
    }


    /**
     * Records and controls calls to one function. Its callable side is the Fakery.Function that
     * `get()` returns; `Fakery(fn)` returns that wrapper directly.
     *
     * @constructor
     * @implements {Fakery.Fake}
     * @param {Function} originalFunction The function being faked.
     * @param {Object=} originalThis Forced `this` when calling the original. Defaults to the
     *     wrapper's own `this`.
     * @param {Fakery.FakeObject=} parentFakeryObject The FakeObject this method belongs to. Its
     *     mode applies when the method has no mode of its own.
     * @param {string=} propertyName The member name on the parent. Defaults to the function's name.
     * @throws {TypeError} If originalFunction is not a function, is already faked, or another
     *     argument has the wrong type.
     */
    function FakeMethod(originalFunction, originalThis, parentFakeryObject, propertyName) {
        if (typeof originalFunction !== "function" || originalFunction instanceof FakeryFunction) {
            throw new TypeError("FakeMethod needs a function that is not already faked");
        }
        if (originalThis != null && typeof originalThis !== "object" && typeof originalThis !== "function" ||
            parentFakeryObject != null && !FakeObject.instanceOf(parentFakeryObject) ||
            propertyName != null && typeof propertyName !== "string") {
            throw new TypeError("FakeMethod: originalThis, parentFakeryObject or propertyName has the wrong type");
        }

        /** Arguments of every call, oldest first. @type {Array<Array>} */
        this.history = [];
        /** @type {string} */
        this.name = propertyName || originalFunction.name;
        /** Declared parameter count of the original. @type {number} */
        this.length = originalFunction.length;

        this._f_original = originalFunction;
        this._f_this = originalThis;
        this._f_parent = parentFakeryObject || null;
        /** @type {?Fakery.Function} The callable wrapper, created on first get(). */
        this._f_wrapper = null;
        /** @type {Array<Fakery.ActionEntry>} */
        this._f_actions = [];
        this._f_mode = 0;
        /** Set by Fakery.unwrap: the wrapper then calls straight through. */
        this._f_unwrapped = false;
    }
    FakeMethod.prototype = Object.create(Fake.prototype);
    defineHidden(FakeMethod.prototype, "constructor", FakeMethod);

    FakeMethod.prototype.original = function original() {
        return this._f_original;
    };

    FakeMethod.prototype.hasAction = function hasAction(args) {
        if (!Array.isArray(args) && args !== null) {
            return null;
        }
        return this._f_actions.find((entry) => argsEqual(entry.args, args)) || null;
    };

    /**
     * Overrides calls. `args` is an array to match against each call's arguments (see
     * Fakery.util_eq), or null to match any call. A call that matches an array override uses it;
     * otherwise the null (catch-all) override is used, if there is one. Overrides apply in every
     * mode except FULL.
     *
     * @param {?Array} args
     * @param {(Fakery.ActionCallback|*)} doThis Gets (this FakeMethod, the call's arguments). A
     *     value that is not a function is returned as is.
     * @returns {FakeMethod} this
     * @throws {TypeError} If args is not an array or null, or doThis is undefined.
     */
    FakeMethod.prototype.onArgsDo = function onArgsDo(args, doThis) {
        if (!Array.isArray(args) && args !== null) {
            throw new TypeError("FakeMethod.onArgsDo: args must be an array to match, or null for any call");
        }
        const callback = toCallback(doThis, "FakeMethod.onArgsDo");
        const entry = this.hasAction(args);
        if (entry) {
            entry.callback = callback;
        } else {
            this._f_actions.push({ args: args, callback: callback });
        }
        return this;
    };

    FakeMethod.prototype.numberOfCalls = function numberOfCalls(args) {
        if (args == null) {
            return this.history.length;
        }
        if (!Array.isArray(args)) {
            throw new TypeError("FakeMethod.numberOfCalls: args must be an array, or omitted for all calls");
        }
        return this.history.filter((callArgs) => argsEqual(callArgs, args)).length;
    };

    FakeMethod.prototype.mode = function mode(newMode) {
        if (newMode == null) {
            return this._f_mode;
        }
        checkMode(newMode);
        this._f_mode = newMode;
        return this;
    };

    FakeMethod.prototype.resetHistory = function resetHistory() {
        this.history = [];
        return this;
    };

    /**
     * Mode for one call: the method's own mode, then its parent FakeObject's, then the FakeObject
     * it was called on (if any), then Fakery.mode.
     */
    function callMode(method, thisArg) {
        return methodMode(method._f_mode ||
            method._f_parent && method._f_parent._f_mode ||
            FakeObject.instanceOf(thisArg) && thisArg._f_mode ||
            Fakery.mode);
    }

    /**
     * Returns the callable wrapper, creating it on first use. Calling it records the arguments,
     * then returns, in order of priority:
     *  - the result of a matching array override (any mode except FULL);
     *  - the result of the catch-all (null) override (any mode except FULL);
     *  - null in HOLLOW mode;
     *  - the result of the original, called with the forced `this` (or the wrapper's own `this`).
     * `new wrapper(...)` constructs the original, so faked constructors keep working. The
     * original's own members (statics such as `Promise.resolve`) can be read through the wrapper.
     *
     * @returns {Fakery.Function}
     */
    FakeMethod.prototype.get = function get() {
        if (this._f_wrapper) {
            return this._f_wrapper;
        }
        const method = this;
        const original = this._f_original;

        const wrapper = function () {
            const args = Array.prototype.slice.call(arguments);
            const thisArg = this;
            const newTarget = new.target;
            const callOriginal = () => {
                if (newTarget) {
                    return Reflect.construct(original, args, newTarget === wrapper ? original : newTarget);
                }
                return original.apply(method._f_this != null ? method._f_this : thisArg, args);
            };

            if (method._f_unwrapped) {
                return callOriginal();
            }
            method.history.push(args.slice());
            const mode = callMode(method, thisArg);
            if (mode !== MODES.FULL) {
                const entry = method.hasAction(args) || method.hasAction(null);
                if (entry) {
                    return entry.callback.call(thisArg, method, args);
                }
                if (mode === MODES.HOLLOW) {
                    return null;
                }
            }
            return callOriginal();
        };

        // The wrapper inherits the Fakery.Function API. Anything else it lacks (statics such as
        // Promise.resolve) is read from the original.
        Object.setPrototypeOf(wrapper, new Proxy(Object.create(FakeryFunction.prototype), {
            get(target, key, receiver) {
                return key in target ? Reflect.get(target, key, receiver) : Reflect.get(original, key);
            }
        }));
        defineHidden(wrapper, "fake", method);
        Object.defineProperty(wrapper, "name", { value: this.name, configurable: true });
        Object.defineProperty(wrapper, "length", { value: this.length, configurable: true });
        if (original.prototype) {
            // `x instanceof wrapper` then answers as `x instanceof original` would.
            wrapper.prototype = original.prototype;
        }
        this._f_wrapper = wrapper;
        return wrapper;
    };


    /**
     * The type of the callable wrapper that `Fakery(fn)` returns. Wrappers are created by
     * FakeMethod.get(); this constructor is never called. The FakeMethod methods are forwarded so
     * they can be called on the wrapper itself: `fakeFn.onArgsDo(...)`, `fakeFn.numberOfCalls()`.
     *
     * @interface
     * @extends {Function}
     */
    function FakeryFunction() {
        throw new TypeError("Fakery.Function cannot be constructed; use Fakery(fn)");
    }
    Object.setPrototypeOf(FakeryFunction.prototype, Function.prototype);
    /** @type {?FakeMethod} The FakeMethod behind this wrapper. */
    FakeryFunction.prototype.fake = null;
    /** @see FakeMethod#original */
    FakeryFunction.prototype.original = function original() {
        return this.fake.original();
    };
    /** @see FakeMethod#hasAction */
    FakeryFunction.prototype.hasAction = function hasAction(args) {
        return this.fake.hasAction(args);
    };
    /** @see FakeMethod#onArgsDo @returns {Fakery.Function} this */
    FakeryFunction.prototype.onArgsDo = function onArgsDo(args, doThis) {
        this.fake.onArgsDo(args, doThis);
        return this;
    };
    /** @see FakeMethod#numberOfCalls */
    FakeryFunction.prototype.numberOfCalls = function numberOfCalls(args) {
        return this.fake.numberOfCalls(args);
    };
    /** @see FakeMethod#mode @returns {(number|Fakery.Function)} */
    FakeryFunction.prototype.mode = function mode(newMode) {
        const result = this.fake.mode(newMode);
        return result === this.fake ? this : result;
    };
    /** @see FakeMethod#resetHistory @returns {Fakery.Function} this */
    FakeryFunction.prototype.resetHistory = function resetHistory() {
        this.fake.resetHistory();
        return this;
    };


    /**
     * The equality used to match call arguments against overrides and numberOfCalls.
     *  - Identical values match. NaN matches NaN.
     *  - Arrays and plain objects match if they have the same own enumerable keys and matching
     *    values, compared recursively. Cycles are handled.
     *  - Dates match by time; RegExps by source and flags.
     *  - Anything else (class instances, DOM nodes, functions) matches only itself. This keeps
     *    matching fast, and stops two different DOM nodes from looking equal.
     */
    function argsEqual(a, b, seen) {
        if (a === b || a !== a && b !== b) {
            return true;
        }
        if (a === null || b === null || typeof a !== "object" || typeof b !== "object") {
            return false;
        }
        if (a instanceof Date || b instanceof Date) {
            return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
        }
        if (a instanceof RegExp || b instanceof RegExp) {
            return a instanceof RegExp && b instanceof RegExp && String(a) === String(b);
        }
        const arrays = Array.isArray(a);
        if (arrays !== Array.isArray(b) || !arrays && !(isPlainObject(a) && isPlainObject(b))) {
            return false;
        }
        // A false result anywhere ends the whole comparison, so a pair already on this list is
        // still being compared further up: treat it as equal to stop the recursion.
        seen = seen || [];
        if (seen.some((pair) => pair[0] === a && pair[1] === b)) {
            return true;
        }
        seen.push([a, b]);
        const keys = Object.keys(a);
        if (keys.length !== Object.keys(b).length) {
            return false;
        }
        return keys.every((key) => hasOwn(b, key) && argsEqual(a[key], b[key], seen));
    }
    function isPlainObject(value) {
        const proto = Object.getPrototypeOf(value);
        return proto === Object.prototype || proto === null;
    }


    Fakery.Fake = Fake;
    Fakery.FakeObject = FakeObject;
    Fakery.FakeMethod = FakeMethod;
    Fakery.Function = FakeryFunction;
    /** Argument equality used by overrides and numberOfCalls; see argsEqual above. */
    Fakery.util_eq = function util_eq(a, b) {
        return argsEqual(a, b);
    };

    return Fakery;
}));
