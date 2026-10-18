/**
 * @file Tests for Testy. Runs in the browser harness (test.html) and under Node (run-node.js).
 */
(function (testOb) {
    "use strict";

    function group(name, body) {
        assert.group("Testy: " + name, testOb, body);
    }
    function three(a, b, c) {
        return [a, b, c];
    }

    group("bindArgs", function () {
        assertEquals([1, "y", "z"], Testy.bindArgs(three, [1])("x", "y", "z"), "a fixed argument replaces the call's");
        assertEquals(["x", 2, "z"], three.bindArgs([undefined, 2])("x", "y", "z"), "undefined entries let the call through");
        assertEquals([1, 2, "z"], three.bindArgs([1]).bindArgs([undefined, 2])("x", "y", "z"),
            "binding a bound function keeps the earlier bindings");
        assertEquals([1, undefined, undefined], three.bindArgs([1])(), "missing arguments stay undefined");
        assert(three.bindArgs() === three, "with no list the function is returned as is");
        assertThrows(function () { three.bindArgs(5); }, "a list that is not array-like throws");
        assertEquals("three_bound", three.bindArgs([1]).name, "the bound function is named after the original");

        const receiver = { v: "receiver" };
        const getV = function (x) { return this.v + x; };
        assertEquals("receiver!", getV.bindArgs([undefined]).call(receiver, "!"), "`this` passes through");

        let calls = 0;
        const caught = Catchy.wrap(three).first(function () { calls++; });
        caught.bindArgs([1])();
        assertEquals(1, calls, "binding a CaughtFunction keeps its hooks");
    });

    group("mute", function () {
        let seen;
        const fn = function (x) { seen = [this, x]; return "value"; };
        const receiver = {};
        const muted = fn.mute();
        assertEquals(undefined, muted.call(receiver, 1), "the muted function returns undefined");
        assert(seen[0] === receiver && seen[1] === 1, "it calls the original with the same `this` and arguments");
        assertEquals("_muted", Testy.mute(function () {}).name, "it is named after the original");
    });

    group("installed methods", function () {
        const keys = [];
        for (const key in function () {}) keys.push(key);
        assertEquals([], keys, "bindArgs and mute are not enumerable on functions");
    });

    assert.testing.release();
    testOb.done();
}(test[_testTesty]));
