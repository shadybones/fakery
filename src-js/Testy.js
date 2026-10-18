/**
 * @file Testy: small function helpers for tests.
 *
 *   Testy.bindArgs(fn, list)  Fix some arguments by position; the rest come from the call.
 *   Testy.mute(fn)            Call fn but return undefined, e.g. to pass it where a return
 *                             value would be misread.
 *
 * Both are also installed on every function, as `fn.bindArgs(list)` and `fn.mute()`. They are
 * defined as non-enumerable properties of Function.prototype.
 *
 * Planned but not implemented: tests declared in a function's doc comment, one line per case,
 * giving the starting arguments, the expected state of those arguments afterwards, and the
 * expected return value:
 *
 *        START PARAMS                      END PARAM STATE              RETURNS
 *   @test {a:1,object:{},callback:null} => {object:{a},callback:[{}]} : object
 *
 * Loads as a browser global (`Testy`), an AMD module ("Testy") or a CommonJS module
 * (`require(".../Testy").Testy`). Needs an ES2015 runtime.
 */
(function (root, factory) {
    "use strict";
    const Testy = factory();
    if (typeof define === "function" && define.amd) {
        define("Testy", [], () => Testy);
    } else if (typeof module === "object" && module.exports) {
        module.exports.Testy = Testy;
    } else {
        root.Testy = Testy;
    }
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";

    function defineMethod(target, name, fn) {
        Object.defineProperty(target, name, { value: fn, writable: true, configurable: true, enumerable: false });
    }

    /**
     * Returns a function that calls `fn` with some arguments fixed by position. Each entry of
     * `list` that is not undefined replaces the call's argument at the same index. An undefined
     * entry (or a hole) lets the call's argument through. Arguments past the end of `list` are
     * passed as they are.
     *
     * Unlike Function.prototype.bind, nothing shifts. A call argument at a fixed position is
     * dropped, and `this` is not bound:
     *
     *   function f(a, b, c) { return [a, b, c]; }
     *   bindArgs(f, [undefined, 2])("x", "y", "z")  // ["x", 2, "z"]
     *
     * Binding an already-bound function layers the lists; earlier bindings win.
     *
     * @param {Function} fn
     * @param {?Array} list Arguments to fix. If omitted, `fn` is returned as it is.
     * @returns {Function}
     * @throws {TypeError} If `fn` is not a function, or `list` is not array-like.
     */
    function bindArgs(fn, list) {
        if (typeof fn !== "function") {
            throw new TypeError("bindArgs needs a function");
        }
        if (list == null) {
            return fn;
        }
        if (typeof list.length !== "number") {
            throw new TypeError("bindArgs: list must be an array of arguments");
        }
        const bound = function () {
            const args = [];
            for (let i = Math.max(list.length, arguments.length); i-- > 0;) {
                args[i] = list[i] !== undefined ? list[i] : arguments[i];
            }
            return fn.apply(this, args);
        };
        Object.defineProperty(bound, "name", { value: fn.name + "_bound", configurable: true });
        return bound;
    }

    /**
     * Returns a function that calls `fn` with the same `this` and arguments, and returns undefined.
     * @param {Function} fn
     * @returns {Function}
     * @throws {TypeError} If `fn` is not a function.
     */
    function mute(fn) {
        if (typeof fn !== "function") {
            throw new TypeError("mute needs a function");
        }
        const muted = function () {
            fn.apply(this, arguments);
        };
        Object.defineProperty(muted, "name", { value: fn.name + "_muted", configurable: true });
        return muted;
    }

    defineMethod(Function.prototype, "bindArgs", function (list) {
        return bindArgs(this, list);
    });
    defineMethod(Function.prototype, "mute", function () {
        return mute(this);
    });

    return {
        bindArgs: bindArgs,
        mute: mute
    };
}));
