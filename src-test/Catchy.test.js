/**
 * @file Tests for Catchy. Runs in the browser harness (test.html) and under Node (run-node.js).
 */
(function (testOb) {
    "use strict";
    const root = typeof globalThis !== "undefined" ? globalThis : self;

    function group(name, body) {
        assert.group("Catchy: " + name, testOb, body);
    }
    function add(a, b) {
        return a + b;
    }

    group("installed methods", function () {
        assert(Catchy.isInstalled(), "Catchy installs itself on load");
        assertEquals("function", typeof add.then, "every function has then()");
        const keys = [];
        for (const key in function () {}) keys.push(key);
        assertEquals([], keys, "the added methods are not enumerable");
    });

    group("then hooks", function () {
        const seen = [];
        const caught = add.then(function () { seen.push([].slice.call(arguments)); });
        assert(caught instanceof Catchy.CaughtFunction, "then() returns a CaughtFunction");
        assertEquals(3, caught(1, 2), "the wrapper passes the arguments and returns the result");
        assertEquals([[1, 2, 3]], seen, "the hook gets the arguments plus the result");
        assert(caught.then(function () {}) === caught, "a CaughtFunction is not wrapped again");
        assert(Catchy.wrap(caught) === caught, "wrap() returns an existing CaughtFunction unchanged");
    });

    group("first hooks and override", function () {
        const order = [];
        const receiver = { name: "receiver" };
        const caught = Catchy.wrap(function (x) { order.push("body " + x); return this; })
            .first(function (x) { order.push("first " + x + " " + this.name); });
        assert(caught.call(receiver, 1) === receiver, "the body gets the call's `this`");
        assertEquals(["first 1 receiver", "body 1"], order, "first hooks run before the body, with the same `this` and arguments");

        caught.override(function (x) { return "override " + x; });
        assertEquals("override 2", caught.call(receiver, 2), "override() replaces the body");
        caught.override(undefined);
        assert(caught.call(receiver, 3) === receiver, "override(undefined) restores the original");
        assertThrows(function () { caught.override(5); }, "override() rejects a non-function");
    });

    group("catching errors", function () {
        function boom() { throw new Error("boom"); }
        let got;
        const caught = Catchy.wrap(boom).catch(function (error, wrapper, source, args) {
            got = { message: error.message, wrapper: wrapper === caught, source: source === boom, args: args };
            return "recovered";
        });
        assertEquals("recovered", caught("a"), "the call returns what the catcher returns");
        assertEquals({ message: "boom", wrapper: true, source: true, args: ["a"] }, got,
            "the catcher gets the error, the wrapper, the failing function and the arguments");

        assertThrows(function () { Catchy.wrap(function () { throw new Error("x"); })(); },
            "with no catcher, errors are rethrown");
        assertThrows(function () { Catchy.wrap(boom).catch(function (e) { throw e; })(); },
            "a catcher can rethrow");

        let hookErrors = 0;
        const withHook = Catchy.wrap(add)
            .first(function () { throw new Error("hook"); })
            .catch(function () { hookErrors++; });
        assertEquals(5, withHook(2, 3), "a hook error goes to the catcher and the call carries on");
        assertEquals(1, hookErrors, "the catcher saw the hook error");
        assertThrows(function () { Catchy.wrap(add).then(function () { throw new Error("hook"); })(1, 1); },
            "with no catcher, a hook error is rethrown");

        let viaThen = 0;
        function boom2() { throw new Error("boom2"); }
        boom2.then(function () {}, function () { viaThen++; })();
        assertEquals(1, viaThen, "then(dothis, onError) also sets the catcher");
    });

    group("defaultCatcher", function () {
        const saved = Catchy.defaultCatcher;
        Catchy.defaultCatcher = function () { return "default"; };
        try {
            const plain = function () { throw new Error("x"); };
            assertEquals("default", plain.catch()(), "fn.catch() with no argument uses Catchy.defaultCatcher");
            assertEquals("default", Catchy.wrap(function () { throw new Error("y"); }).catch()(),
                "so does caught.catch()");
        } finally {
            Catchy.defaultCatcher = saved;
        }
        assertThrows(function () { Catchy.wrap(add).catch(); }, "catch() with nothing to use throws");
    });

    group("wrapper details", function () {
        assertThrows(function () { Catchy.wrap(5); }, "wrap() needs a function");
        assertThrows(function () { new Catchy.CaughtFunction(add); }, "CaughtFunction cannot be called with new");

        function Point(x) { this.x = x; }
        const CaughtPoint = Catchy.wrap(Point);
        const p = new CaughtPoint(4);
        assert(p instanceof Point && p.x === 4, "constructors work through the wrapper");

        const named = Catchy.wrap(function save() {}).then(function () {}).catch(function () {});
        assertEquals("CaughtFunction {hasCatcher, runAfter:1, save}", String(named), "toString summarises the wrapper");

        root.catchyGlobalFn = function catchyGlobalFn() { return "global"; };
        try {
            const wrapped = root.catchyGlobalFn.then(function () {});
            assert(root.catchyGlobalFn === wrapped, "a function reachable as a global under its own name is replaced there");
        } finally {
            delete root.catchyGlobalFn;
        }
    });

    group("promisify", function () {
        const value = add.promisify()(1, 2).then(function (sum) { return sum * 10; });
        let result;
        value.then(function (v) { result = v; });
        assertEquals(30, result, "then callbacks run at once and chain their results");

        let error;
        const failed = (function () { throw new Error("nope"); }).promisify()();
        failed.then(function () { error = "wrong branch"; }).catch(function (e) { error = e.message; });
        assertEquals("nope", error, "an error skips then() and reaches catch()");

        let finallyRan = false;
        failed.finally(function () { finallyRan = true; });
        assert(finallyRan, "finally runs");

        const bound = (function () { return this.v; }).promisify({ v: "bound" });
        let boundValue;
        bound().then(function (v) { boundValue = v; });
        assertEquals("bound", boundValue, "promisify(bind) forces `this`");
    });

    group("uninstall and install", function () {
        const caught = Catchy.wrap(add);
        Catchy.uninstall();
        try {
            assertEquals("undefined", typeof add.then, "uninstall() removes the methods from functions");
            assert(!Catchy.isInstalled(), "isInstalled() reports it");
            caught.then(function () {});
            assertEquals(3, caught(1, 2), "existing CaughtFunctions keep working");
        } finally {
            Catchy.install();
        }
        assertEquals("function", typeof add.then, "install() puts them back");
    });

    assert.testing.release();

    // Every function has a `then` while Catchy is installed. Native promises must still take a
    // function as a plain value. These settle asynchronously, so the suite finishes afterwards.
    const PROMISE_GROUP = "Catchy: functions as promise values";
    const caught = Catchy.wrap(add);
    const checks = [
        ["await fn", (async function () { return await add; })(), add],
        ["Promise.resolve(fn)", Promise.resolve(add), add],
        ["an async function returning fn", (async function () { return add; })(), add],
        ["Promise.all([fn])", Promise.all([add]).then((list) => list[0]), add],
        ["a then() callback returning fn", Promise.resolve(1).then(() => add), add],
        ["Promise.resolve(caughtFunction)", Promise.resolve(caught), caught]
    ];
    let timer;
    const timedOut = new Promise((resolve) => { timer = setTimeout(() => resolve("timed out"), 2000); });
    Promise.all(checks.map(function (check) {
        return Promise.race([check[1], timedOut]).then(function (value) {
            assert(value === check[2], check[0] + " resolves to the function itself", PROMISE_GROUP, testOb);
        });
    })).then(function () {
        clearTimeout(timer);
        assert(add.then(function () {}) instanceof Catchy.CaughtFunction,
            "fn.then(hook) still wraps the function", PROMISE_GROUP, testOb);
        testOb.done();
    });
}(test[_testCatchy]));
