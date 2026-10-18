/**
 * @file Minimal assertion helpers for the test files in this folder. They work both in the
 * browser harness (test.html) and under Node (run-node.js).
 *
 * Each assertion records a TestResult into the current test object's `result` array. Set the
 * current test with `assert.testing(name, testOb)`, or group assertions with
 * `assert.group(name, testOb, body)`. A failed assertion is also logged with console.error.
 */
(function () {
    "use strict";

    /**
     * Records whether `truth` is truthy. With no description this is a chain assertion: it
     * records nothing and returns an object with `equals`, so `assert(1).equals(2, "d")` is the
     * same as `assertEquals(1, 2, "d")`.
     *
     * @param {*} truth
     * @param {string=} desc What is being checked. Omit it to start a chain assertion.
     * @param {string=} testname The test's name; defaults to the one set by assert.testing.
     * @param {Object=} testOb The test object (has `result[]`); defaults to the one set by assert.testing.
     * @param {*=} errorInfo Extra detail for the failure message.
     * @returns {(undefined|{testname: string, testOb: Object, value: *, equals: Function})}
     */
    function assert(truth, desc, testname, testOb, errorInfo) {
        testname = testname || assert._testname;
        testOb = testOb || assert._testOb;

        if (desc === undefined) {
            return {
                testname: testname,
                testOb: testOb,
                value: truth,
                equals: function (expected, description) {
                    assertEquals(this.value, expected, description, this.testname, this.testOb);
                }
            };
        }
        let error;
        if (!truth) {
            error = new Error((testname ? "Testing " + testname + ":  " : "") + (errorInfo || "This was not true") + ". " + desc);
            if (typeof console !== "undefined") {
                console.error(error);
            }
        }
        if (testOb) {
            testOb.result.push(new TestResult(truth, desc, testname, error));
        }
    }

    /**
     * Records whether `actual` and `expected` are equal in structure and value (see _equals).
     * @param {*} actual
     * @param {*} expected
     * @param {string=} desc
     * @param {string=} testname
     * @param {Object=} testOb
     */
    function assertEquals(actual, expected, desc, testname, testOb) {
        assert(_equals(actual, expected), desc || "Was Equal", testname, testOb,
            "Expected: " + describe(expected) + ", but got: " + describe(actual));
    }

    /**
     * Records whether `fun` throws when called.
     * @param {Function} fun
     * @param {string=} desc
     * @param {string=} testname
     * @param {Object=} testOb
     * @throws {Error} If `fun` is not a function.
     */
    function assertThrows(fun, desc, testname, testOb) {
        if (typeof fun !== "function") {
            throw new Error("Illegal Args. Requires a function");
        }
        let threw = false;
        try {
            fun();
        } catch (e) {
            threw = true;
        }
        assert(threw, desc || (threw ? "Threw" : "Didn't Throw"), testname, testOb, "Expected an exception");
    }

    function describe(value) {
        if (value instanceof Object && typeof value !== "function") {
            try {
                return JSON.stringify(value);
            } catch (circular) {
                return String(value);
            }
        }
        return String(value);
    }

    /**
     * Generous equality of structure and value. Objects must have the same prototype and the same
     * own enumerable keys, in any order. Values with their own `equals` method use it.
     * @param {*} a
     * @param {*} b
     * @returns {boolean}
     */
    function _equals(a, b) {
        if (a === b || a !== a && b !== b) return true;
        if (a === null || b === null || typeof a !== typeof b || typeof a !== "object") return false;
        if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;
        if (typeof a.equals === "function" && typeof b.equals === "function") return a.equals(b);
        if (a instanceof RegExp || a instanceof Date) return a.toString() === b.toString();
        if (Array.isArray(a)) {
            if (a.length !== b.length) return false;
            for (let i = a.length; i-- > 0;) {
                if (!_equals(a[i], b[i])) return false;
            }
            return true;
        }
        const keys = Object.keys(a).sort();
        if (keys.join("$") !== Object.keys(b).sort().join("$")) return false;
        return keys.every(function (key) {
            return _equals(a[key], b[key]);
        });
    }

    /**
     * One recorded assertion.
     * @param {*} value The asserted value.
     * @param {string} desc
     * @param {string} testname
     * @param {Error=} error Present if the assertion failed.
     * @constructor
     */
    function TestResult(value, desc, testname, error) {
        this.value = value;
        this.desc = desc;
        this.testname = testname;
        this.error = error;
        if (error && error.stack) {
            // The last stack frame points at the test file's call site in most browsers.
            this.errorSource = error.stack.substring(error.stack.lastIndexOf("at "));
        }
    }

    /**
     * Sets the default test name and test object for the assertions that follow.
     * @param {string} desc The test's name, usually the class and method under test.
     * @param {Object=} testOb The test object (has `result[]`). Left unchanged if omitted.
     */
    assert.testing = function (desc, testOb) {
        assert._testname = desc;
        if (testOb !== undefined) {
            assert._testOb = testOb;
        }
    };
    assert.testing.release = function () {
        assert.testing("", null);
    };

    /**
     * Runs `body` with `name` as the current test. If `body` throws, records a failure rather than
     * aborting the rest of the file.
     * @param {string} name
     * @param {Object} testOb
     * @param {Function} body
     */
    assert.group = function (name, testOb, body) {
        assert.testing(name, testOb);
        try {
            body();
        } catch (e) {
            assert(false, "threw " + (e && e.stack || e), name, testOb, "Unexpected exception");
        }
    };
    assert._equals = _equals;

    const api = { assert: assert, assertEquals: assertEquals, assertThrows: assertThrows };
    if (typeof define === "function" && define.amd) {
        define(function () { return api; });
    } else {
        const target = typeof exports !== "undefined" ? exports : self;
        Object.keys(api).forEach(function (name) {
            target[name] = api[name];
        });
    }
}());
