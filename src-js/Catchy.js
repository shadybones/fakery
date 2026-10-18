/**
 * @file Catchy: hooks, overrides and error handling for any function, without editing it.
 *
 * Catchy wraps a function in a CaughtFunction, a drop-in replacement that:
 *   - runs `first` hooks before each call and `then` hooks after it;
 *   - can swap the body for an `override`;
 *   - sends errors from the body or any hook to a `catch` handler.
 * If the original is reachable as a global under its own name (a top-level function declaration
 * in a browser script, for example), that global is replaced with the wrapper. Code that calls it
 * by name then goes through the hooks too.
 *
 * Catchy installs itself when loaded: `then`, `catch`, `override`, `first` and `promisify` become
 * available on every function. It does this by putting its methods in the prototype chain of
 * Function.prototype. So `myFunction.then(log)` wraps `myFunction` and returns the wrapper.
 * `Catchy.wrap(fn)` does the same without relying on the installed methods.
 *
 * Promises: a value with a `then` method looks like a promise, so with Catchy installed every
 * function looks like one. When native promise code calls `then` (for `await fn`,
 * `Promise.resolve(fn)`, or an async function returning fn), Catchy recognises the promise's own
 * resolve and reject functions. It then resolves the promise with the function itself, so those
 * keep working. Promise implementations written in JavaScript (polyfills, or zone.js in Angular
 * apps) are not recognised, and would wait forever. In such code, call `Catchy.uninstall()` and
 * use `Catchy.wrap(fn)`.
 *
 * Loads as a browser global (`Catchy`), an AMD module ("Catchy") or a CommonJS module
 * (`require(".../Catchy").Catchy`). Needs an ES2015 runtime.
 */
(function (root, factory) {
    "use strict";
    const Catchy = factory(root);
    if (typeof define === "function" && define.amd) {
        define("Catchy", [], () => Catchy);
    } else if (typeof module === "object" && module.exports) {
        module.exports.Catchy = Catchy;
    } else {
        root.Catchy = Catchy;
    }
}(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
    "use strict";

    /**
     * Handles an error thrown by a CaughtFunction's body or one of its hooks. `this` is the
     * call's `this`. When the body threw, the CaughtFunction returns what the catcher returns.
     *
     * @callback Catchy.Catcher
     * @param {*} error What was thrown.
     * @param {CaughtFunction} caught The wrapper that caught it.
     * @param {Function} source The function that threw: the original, the override, or a hook.
     * @param {Array} args The call's arguments. For a `then` hook, the result is appended.
     * @returns {*}
     */

    /**
     * A hook or override. It gets the call's `this` and arguments. A `then` hook also gets the
     * result as an extra last argument.
     * @callback Catchy.Callback
     */

    function defineMethod(target, name, fn) {
        Object.defineProperty(target, name, { value: fn, writable: true, configurable: true, enumerable: false });
    }

    const Catchy = {
        /**
         * Used by `fn.catch()` (and `caught.catch()`) when called with no handler.
         * @type {(Catchy.Catcher|undefined)}
         */
        defaultCatcher: undefined
    };


    // ---- Staying out of the way of native promises -------------------------------------------

    /** The function being handed to a native promise as a plain value, while that happens. */
    let resolvingAsValue = null;
    const NATIVE_CODE = /\{\s*\[native code\]\s*\}\s*$/;

    /**
     * Whether `fn` looks like the resolve or reject function a native promise passes to `then`.
     * Those are built-in, anonymous and take one argument. A hook a test passes is never all three.
     */
    function isPromiseResolver(fn) {
        if (typeof fn !== "function" || fn.name !== "" || fn.length !== 1) {
            return false;
        }
        try {
            return NATIVE_CODE.test(Function.prototype.toString.call(fn));
        } catch (revokedProxy) {
            return false;
        }
    }

    /**
     * If `then` was called by native promise code, resolves that promise with `fn` itself and
     * returns true. While `resolve(fn)` runs, `fn.then` reads as undefined, so the promise takes
     * `fn` as a plain value instead of asking it again.
     */
    function resolvedAsValue(fn, onFulfilled, onRejected) {
        if (!isPromiseResolver(onFulfilled) || !isPromiseResolver(onRejected)) {
            return false;
        }
        resolvingAsValue = fn;
        try {
            onFulfilled(fn);
        } finally {
            resolvingAsValue = null;
        }
        return true;
    }

    /** Defines `then` as an accessor, so it can hide itself while resolvedAsValue runs. */
    function defineThen(target, then) {
        Object.defineProperty(target, "then", {
            configurable: true,
            enumerable: false,
            get: function () {
                return this === resolvingAsValue ? undefined : then;
            },
            set: function (value) {
                Object.defineProperty(this, "then", { value: value, writable: true, configurable: true, enumerable: true });
            }
        });
    }


    // ---- CaughtFunction -----------------------------------------------------------------------

    /**
     * Returns the CaughtFunction that wraps `original`. If `original` is already one, it is
     * returned unchanged. This is a factory: calling it with `new` throws.
     *
     * Each call runs: the `first` hooks; the override, or else the original; then the `then`
     * hooks, which also get the result. If anything throws, the error goes to the catcher. With
     * no catcher, the error is rethrown. If the body threw, the call returns what the catcher
     * returns. If a hook threw, the call carries on and returns as normal.
     *
     * @param {Function} original
     * @returns {CaughtFunction}
     * @throws {TypeError} If `original` is not a function, or on `new CaughtFunction(...)`.
     */
    function CaughtFunction(original) {
        if (new.target) {
            throw new TypeError("CaughtFunction is a factory; call it without \"new\"");
        }
        if (typeof original !== "function") {
            throw new TypeError("CaughtFunction needs a function");
        }
        if (original instanceof CaughtFunction) {
            return original;
        }

        const caught = function () {
            const args = Array.prototype.slice.call(arguments);
            const thisArg = this;
            runHooks(caught, caught.__before__, thisArg, args);

            const body = typeof caught.__override__ === "function" ? caught.__override__ : original;
            let result;
            try {
                result = new.target
                    ? Reflect.construct(body, args, new.target === caught ? original : new.target)
                    : body.apply(thisArg, args);
            } catch (error) {
                return handleError(caught, error, body, args, thisArg);
            }
            runHooks(caught, caught.__after__, thisArg, args.concat([result]));
            return result;
        };
        Object.setPrototypeOf(caught, CaughtFunction.prototype);
        /** @type {Function} The wrapped function. */
        caught.__original__ = original;
        if (original.prototype) {
            caught.prototype = original.prototype;
        }

        // Route calls that look the function up by its global name through the wrapper too.
        if (original.name && root[original.name] === original) {
            try {
                root[original.name] = caught;
            } catch (readOnlyGlobal) {
                // Leave a non-writable global alone; the wrapper still works when called directly.
            }
        }
        return caught;
    }

    /** Runs each hook with the call's `this` and arguments. A hook's error goes to the catcher. */
    function runHooks(caught, hooks, thisArg, args) {
        if (!hooks) {
            return;
        }
        hooks.slice().forEach((hook) => {
            try {
                hook.apply(thisArg, args);
            } catch (error) {
                handleError(caught, error, hook, args, thisArg);
            }
        });
    }

    /** Hands an error to the catcher and returns its result, or rethrows if there is no catcher. */
    function handleError(caught, error, source, args, thisArg) {
        if (typeof caught.__catcher__ !== "function") {
            throw error;
        }
        return caught.__catcher__.call(thisArg, error, caught, source, args);
    }

    /**
     * Adds a hook that runs after each successful call. It gets the arguments with the result
     * appended.
     * @param {Catchy.Callback} dothis
     * @param {Catchy.Catcher=} onError If given, also set as the catcher (see catch()).
     * @returns {CaughtFunction} this
     */
    defineThen(CaughtFunction.prototype, function then(dothis, onError) {
        if (resolvedAsValue(this, dothis, onError)) {
            return undefined;
        }
        if (typeof dothis !== "function") {
            throw new TypeError("then() needs a function");
        }
        (this.__after__ = this.__after__ || []).push(dothis);
        if (onError) {
            this.catch(onError);
        }
        return this;
    });

    /**
     * Sets the catcher, replacing any previous one. With no argument, uses Catchy.defaultCatcher.
     * @param {Catchy.Catcher=} withthis
     * @returns {CaughtFunction} this
     */
    CaughtFunction.prototype.catch = function (withthis) {
        withthis = withthis || Catchy.defaultCatcher;
        if (typeof withthis !== "function") {
            throw new TypeError("catch() needs a function, or Catchy.defaultCatcher must be set");
        }
        this.__catcher__ = withthis;
        return this;
    };

    /**
     * Replaces the body: calls run `withthis` instead of the original, still inside the hooks
     * and catcher. Pass undefined to restore the original.
     * @param {(Catchy.Callback|undefined)} withthis
     * @returns {CaughtFunction} this
     */
    CaughtFunction.prototype.override = function override(withthis) {
        if (typeof withthis !== "function" && withthis !== undefined) {
            throw new TypeError("override() needs a function, or undefined to remove the override");
        }
        this.__override__ = withthis;
        return this;
    };

    /**
     * Adds a hook that runs before each call, with the same `this` and arguments.
     * @param {Catchy.Callback} dothis
     * @returns {CaughtFunction} this
     */
    CaughtFunction.prototype.first = function first(dothis) {
        if (typeof dothis !== "function") {
            throw new TypeError("first() needs a function");
        }
        (this.__before__ = this.__before__ || []).push(dothis);
        return this;
    };

    /** Summarises the wrapper's configuration, e.g. "CaughtFunction {hasCatcher, runAfter:1, save}". */
    CaughtFunction.prototype.toString = function toString() {
        const parts = [];
        if (this.__catcher__) parts.push("hasCatcher");
        if (this.__override__) parts.push("hasOverride");
        if (this.__before__) parts.push("runBefore:" + this.__before__.length);
        if (this.__after__) parts.push("runAfter:" + this.__after__.length);
        if (this.__original__) parts.push(this.__original__.name || "hasOriginal");
        return "CaughtFunction {" + parts.join(", ") + "}";
    };

    /**
     * Returns a function that calls this one synchronously, and returns a settled, promise-like
     * result instead of returning a value or throwing.
     *
     * The result is not a native Promise: `then`, `catch` and `finally` run their callbacks
     * immediately. That keeps synchronous test code synchronous. It can still be awaited. A
     * rejection that is never handled is not reported anywhere.
     *
     * @param {Object=} bind Forced `this` for the call. Defaults to the caller's `this`.
     * @returns {function(...*): SettledResult}
     */
    function promisify(bind) {
        const fn = this;
        return function () {
            try {
                return settled(true, fn.apply(bind || this, arguments));
            } catch (error) {
                return settled(false, error);
            }
        };
    }
    defineMethod(CaughtFunction.prototype, "promisify", promisify);

    /**
     * A synchronously settled thenable.
     * @typedef {{then: Function, catch: Function, finally: Function}} SettledResult
     */
    function settled(fulfilled, value) {
        const result = {
            then: function (onFulfilled, onRejected) {
                const handler = fulfilled ? onFulfilled : onRejected;
                if (typeof handler !== "function") {
                    return result;
                }
                try {
                    const next = handler(value);
                    // Adopt thenable objects. Functions are skipped on purpose: with Catchy
                    // installed, every function looks thenable.
                    return next !== null && typeof next === "object" && typeof next.then === "function"
                        ? next
                        : settled(true, next);
                } catch (error) {
                    return settled(false, error);
                }
            },
            catch: function (onRejected) {
                return result.then(undefined, onRejected);
            },
            finally: function (onFinally) {
                if (typeof onFinally === "function") {
                    try {
                        onFinally();
                    } catch (error) {
                        return settled(false, error);
                    }
                }
                return result;
            }
        };
        return result;
    }

    Object.setPrototypeOf(CaughtFunction.prototype, Function.prototype);


    // ---- Installing on every function ---------------------------------------------------------

    /**
     * The methods Catchy adds to every function while installed. Each one wraps the function it
     * is called on, and calls the CaughtFunction method of the same name.
     */
    const functionMethods = Object.create(Object.getPrototypeOf(Function.prototype));
    defineThen(functionMethods, function then(dothis, onError) {
        if (resolvedAsValue(this, dothis, onError)) {
            return undefined;
        }
        return CaughtFunction(this).then(dothis, onError);
    });
    defineMethod(functionMethods, "catch", function (withthis) {
        return CaughtFunction(this).catch(withthis);
    });
    defineMethod(functionMethods, "override", function override(withthis) {
        return CaughtFunction(this).override(withthis);
    });
    defineMethod(functionMethods, "first", function first(dothis) {
        return CaughtFunction(this).first(dothis);
    });
    defineMethod(functionMethods, "promisify", promisify);

    /**
     * Wraps a function without relying on the methods Catchy installs.
     * @param {Function} fn
     * @returns {CaughtFunction}
     */
    Catchy.wrap = function wrap(fn) {
        return CaughtFunction(fn);
    };

    /**
     * Makes then/catch/override/first/promisify available on every function. Runs on load.
     * @returns {Object} Catchy
     */
    Catchy.install = function install() {
        if (!Catchy.isInstalled()) {
            Object.setPrototypeOf(functionMethods, Object.getPrototypeOf(Function.prototype));
            Object.setPrototypeOf(Function.prototype, functionMethods);
        }
        return Catchy;
    };

    /**
     * Removes the methods that install() added. Existing CaughtFunctions keep working.
     * @returns {Object} Catchy
     */
    Catchy.uninstall = function uninstall() {
        if (Catchy.isInstalled()) {
            Object.setPrototypeOf(Function.prototype, Object.getPrototypeOf(functionMethods));
        }
        return Catchy;
    };

    /** @returns {boolean} Whether this copy of Catchy is installed on Function.prototype. */
    Catchy.isInstalled = function isInstalled() {
        return Object.getPrototypeOf(Function.prototype) === functionMethods;
    };

    /** The CaughtFunction factory, for `instanceof` checks. */
    Catchy.CaughtFunction = CaughtFunction;

    Catchy.install();
    return Catchy;
}));
