/**
 * @file Tests for Fakery. Runs in the browser harness (test.html) and under Node (run-node.js).
 * The groups at the end that need a real DOM run only in a browser.
 */
(function (testOb) {
    "use strict";
    const MODES = Fakery.MODES;

    /** Runs a group of assertions, starting from the default global mode. */
    function group(name, body) {
        Fakery.mode = MODES.MASK;
        assert.group("Fakery: " + name, testOb, body);
        Fakery.mode = MODES.MASK;
    }

    /** A small stand-in for `document`: one property, and methods that rely on `this`. */
    function makeDoc() {
        return {
            title: "Real title",
            elements: { a: { id: "a" } },
            getElementById: function (id) { return this.elements[id] || null; },
            createElement: function (tag) { return { tag: tag }; }
        };
    }

    group("creating fakes", function () {
        const doc = makeDoc();
        const fake = Fakery(doc);
        assert(Fakery.FakeObject.instanceOf(fake), "Fakery(object) returns a FakeObject");
        assert(!Fakery.FakeObject.instanceOf(doc), "the original is not a FakeObject");
        assert(fake.original() === doc, "original() returns the faked object");
        assert(Fakery(fake) === fake, "faking a fake returns it unchanged");
        assertEquals(Object.keys(doc), Object.keys(fake), "own keys mirror the original's enumerable members");
        assertEquals(JSON.stringify(doc), JSON.stringify(fake), "JSON.stringify sees the same data, and no bookkeeping");

        const fn = Fakery(function add(a, b) { return a + b; });
        assert(fn instanceof Fakery.Function, "Fakery(function) returns a Fakery.Function");
        assert(fn.fake instanceof Fakery.FakeMethod, "the wrapper's .fake is its FakeMethod");
        assert(fn.fake instanceof Fakery.Fake, "FakeMethod implements Fakery.Fake");
        assertEquals("add", fn.name, "the wrapper keeps the original's name");
        assertEquals(2, fn.length, "the wrapper keeps the original's length");
        assert(Fakery(fn) === fn, "faking a fake function returns it unchanged");
        assert(Fakery(fn.fake) === fn, "faking a FakeMethod returns its wrapper");

        assertThrows(function () { Fakery(null); }, "Fakery(null) throws");
        assertThrows(function () { Fakery(5); }, "Fakery(primitive) throws");
        assertThrows(function () { new Fakery.Function(); }, "Fakery.Function cannot be constructed");
    });

    group("MASK mode passes through", function () {
        const doc = makeDoc();
        const fake = Fakery(doc);
        assertEquals("Real title", fake.title, "properties read from the original");
        assertEquals({ id: "a" }, fake.getElementById("a"), "methods run against the original as `this`");
        assertEquals(1, fake.numberOfCalls("title"), "reads are counted");
        assertEquals(1, fake.getElementById.numberOfCalls(), "calls are counted");
        assertEquals([["a"]], fake.getElementById.fake.history, "call arguments are recorded");
    });

    group("property overrides", function () {
        const doc = makeDoc();
        const fake = Fakery(doc);
        const seen = [];
        fake.onArgsDo("title", function (f, args) {
            seen.push(args);
            return "Fake title";
        });
        assertEquals("Fake title", fake.title, "a read returns the callback's result");
        fake.title = "Written";
        assertEquals([["title"], ["title", "Written"]], seen, "the callback sees reads as [name] and writes as [name, value]");
        assertEquals("Real title", doc.title, "an overridden write leaves the original alone");
        assertEquals(1, fake.numberOfWrites("title"), "writes are counted");
        assert(fake.hasAction("title") !== null, "hasAction finds the override");

        fake.onArgsDo("missing", () => "added");
        assertEquals("added", fake.missing, "a member the original lacks can be added");
        assert(!("missing" in doc), "adding it does not touch the original");

        const data = Fakery({ value: 1 });
        data.onArgsDo("value", function () { return 0; });
        assertEquals(0, data.value, "a callback with no declared parameters is accepted");
    });

    group("method overrides", function () {
        const fake = Fakery(makeDoc());
        fake.getElementById.onArgsDo(["my-id"], function (method, args) {
            return { src: "hi.js", asked: args[0], method: method.name };
        });
        assertEquals({ src: "hi.js", asked: "my-id", method: "getElementById" }, fake.getElementById("my-id"),
            "matching arguments return the callback's result");
        assertEquals({ id: "a" }, fake.getElementById("a"), "other arguments reach the original");

        fake.getElementById.onArgsDo(null, function () { return "any"; });
        assertEquals("any", fake.getElementById("a"), "a null override catches every other call, even in MASK mode");
        assertEquals("hi.js", fake.getElementById("my-id").src, "an argument-specific override beats the catch-all");

        const countFn = Fakery(function () { return 9; }).mode(MODES.HOLLOW);
        countFn.onArgsDo(null, function () { return 0; });
        assertEquals(0, countFn(), "a falsy catch-all result is returned as is");

        const receiver = { tag: "receiver" };
        let thisSeen;
        const free = Fakery(function () {});
        free.onArgsDo(null, function () { thisSeen = this; });
        free.call(receiver);
        assert(thisSeen === receiver, "callbacks run with the call's `this`");

        assertThrows(function () { fake.getElementById.onArgsDo("my-id", function () {}); },
            "a FakeMethod rejects arguments that are not an array or null");
        assertEquals(4, fake.getElementById.numberOfCalls(), "numberOfCalls() counts every call");
        assertEquals(2, fake.getElementById.numberOfCalls(["my-id"]), "numberOfCalls(args) counts matching calls");
    });

    group("Fakery.on", function () {
        const fake = Fakery(makeDoc());
        Fakery.on(fake, "title", function () { return "via on"; });
        assertEquals("via on", fake.title, "a property name overrides the property");

        Fakery.on(fake, "createElement", function (method, args) { return "made " + args[0]; });
        assertEquals("made div", fake.createElement("div"), "a method name overrides every call to the method");
        assert(typeof fake.createElement === "function", "the method itself is still a function");

        Fakery.on(fake.getElementById, ["x"], function () { return "x!"; });
        assertEquals("x!", fake.getElementById("x"), "a fake function with an argument array");
        Fakery.on(fake.getElementById, null, function () { return "any"; });
        assertEquals("any", fake.getElementById("y"), "a fake function with null");

        assertThrows(function () { Fakery.on(fake, ["title"], function () {}); }, "an array on a FakeObject throws");
        assertThrows(function () { Fakery.on(fake.getElementById, "x", function () {}); }, "a string on a fake function throws");
        assertThrows(function () { Fakery.on(fake, "title"); }, "a missing callback throws");
    });

    group("writes", function () {
        const doc = makeDoc();
        const fake = Fakery(doc);
        fake.title = "Changed";
        assertEquals("Changed", doc.title, "MASK mode writes through to the original");

        const realGet = doc.getElementById;
        fake.getElementById = function (id) { return "replaced " + id; };
        assertEquals("replaced a", fake.getElementById("a"), "assigning a function replaces the method on the fake");
        assert(doc.getElementById === realGet, "the original's method is untouched");
        assertEquals(1, fake.getElementById.numberOfCalls(), "the replacement's calls are recorded");

        const other = Fakery(function () { return "other"; });
        fake.createElement = other;
        assert(fake.createElement === other, "assigning a fake function installs it as is");

        fake.mode(MODES.HOLLOW);
        fake.title = "Hollow write";
        assertEquals("Changed", doc.title, "HOLLOW mode drops writes");
    });

    group("HOLLOW mode", function () {
        const doc = makeDoc();
        const fake = Fakery(doc).mode(MODES.HOLLOW);
        assertEquals(null, fake.title, "unoverridden properties read as null");
        assertEquals(null, fake.getElementById("a"), "unoverridden calls return null");
        fake.onArgsDo("title", function () { return "kept"; });
        fake.getElementById.onArgsDo(["a"], function () { return "kept"; });
        assertEquals("kept", fake.title, "overridden properties still work");
        assertEquals("kept", fake.getElementById("a"), "overridden calls still work");
        assertEquals(2, fake.getElementById.numberOfCalls(["a"]), "calls are still recorded");

        Fakery.mode = MODES.HOLLOW;
        assertEquals(null, Fakery(makeDoc()).title, "the global mode applies to fakes without their own mode");
    });

    group("FULL mode", function () {
        const fake = Fakery(makeDoc()).mode(MODES.FULL);
        fake.onArgsDo("title", function () { return "ignored"; });
        fake.getElementById.onArgsDo(null, function () { return "ignored"; });
        assertEquals("Real title", fake.title, "property overrides are ignored");
        assertEquals({ id: "a" }, fake.getElementById("a"), "method overrides are ignored");
        assertEquals(1, fake.getElementById.numberOfCalls(), "calls are still recorded");
    });

    group("PROPERTIES_ONLY mode", function () {
        const fake = Fakery(makeDoc());
        fake.mode(MODES.PROPERTIES_ONLY);
        assertEquals(MODES.PROPERTIES_ONLY, fake.mode(), "can be set on one fake");
        fake.onArgsDo("title", function () { return "ignored"; });
        assertEquals("Real title", fake.title, "properties behave as in FULL mode");
        assertEquals(null, fake.getElementById("a"), "methods behave as in HOLLOW mode");
        fake.getElementById.onArgsDo(["a"], function () { return "overridden"; });
        assertEquals("overridden", fake.getElementById("a"), "overridden calls still work");
    });

    group("mode precedence", function () {
        const fake = Fakery(makeDoc()).mode(MODES.HOLLOW);
        const detached = fake.getElementById;
        assertEquals(null, detached("a"), "a method uses its parent's mode, even when called detached");
        detached.mode(MODES.MASK);
        assertEquals({ id: "a" }, detached("a"), "the method's own mode wins over its parent's");
        assertEquals(0, Fakery(makeDoc()).mode(), "mode() is 0 (inherit) until set");
        assertThrows(function () { fake.mode(7); }, "an unknown mode throws");
    });

    group("awkward member names", function () {
        const fake = Fakery({
            push: function () { return "push"; },
            length: function () { return "length"; },
            indexOf: function () { return "indexOf"; },
            other: function () { return "other"; }
        });
        assertEquals("push", fake.push(), "a method named push works");
        assertEquals("length", fake.length(), "a method named length works");
        fake.indexOf = function () { return "new"; };
        assertEquals("new", fake.indexOf(), "a method named indexOf can be replaced");
        assertEquals("other", fake.other(), "replacing one method leaves the others alone");

        const plain = Fakery({ x: 1 });
        plain.onArgsDo("constructor", function () { return "ctor"; });
        assertEquals("ctor", plain.constructor, "names from Object.prototype can be overridden");
        assertEquals("undefined", typeof Object.callback, "and doing so does not touch Object");
        assertThrows(function () { plain.onArgsDo("mode", function () {}); }, "FakeObject API names cannot be overridden");
    });

    group("members the original does not enumerate", function () {
        const original = { shown: 1 };
        Object.defineProperty(original, "hidden", { value: "real", enumerable: false });
        Object.defineProperty(original, "hiddenFn", { value: function () { return "real"; }, enumerable: false });
        const fake = Fakery(original);
        assertEquals("real", fake.hidden, "they are faked too");
        assertEquals(1, fake.numberOfCalls("hidden"), "so their reads are counted");
        assertEquals(["shown"], Object.keys(fake), "and they stay non-enumerable on the fake");
        fake.onArgsDo("hidden", function () { return "fake"; });
        assertEquals("fake", fake.hidden, "onArgsDo overrides them");
        Fakery.on(fake, "hiddenFn", function () { return "fake"; });
        assertEquals("fake", fake.hiddenFn(), "Fakery.on overrides a non-enumerable method");

        const fakeJSON = Fakery(JSON);
        fakeJSON.stringify({ a: 1 });
        assertEquals(1, fakeJSON.stringify.numberOfCalls([{ a: 1 }]), "JSON.stringify is faked without applyProperties");

        original.later = "added";
        assertEquals("added", fake.later, "a member added to the original later is still readable");
        fake.onArgsDo("later", "overridden");
        assertEquals("overridden", fake.later, "and can be overridden");
    });

    group("class instances", function () {
        class Service {
            constructor() { this.id = 7; }
            #token = "secret";
            get token() { return this.#token; }
            load(what) { return what + " with " + this.#token; }
        }
        const service = new Service();
        const fake = Fakery(service);
        assertEquals("secret", fake.token, "getters that use private fields work");
        assertEquals("data with secret", fake.load("data"), "methods that use private fields work");
        assertEquals(1, fake.load.numberOfCalls(), "class methods are faked and recorded");
        fake.load.onArgsDo(["data"], "stubbed");
        assertEquals("stubbed", fake.load("data"), "and can be overridden");
        assertEquals(["id"], Object.keys(fake), "Object.keys matches the instance's own fields");
        assert(fake instanceof Service, "instanceof still sees the class");
    });

    group("built-in objects", function () {
        const map = new Map([["a", 1]]);
        const fake = Fakery(map);
        assertEquals(1, fake.get("a"), "Map methods run against the real map");
        assertEquals(1, fake.size, "Map getters run against the real map");
        assertEquals([["a", 1]], Array.from(fake), "the fake is iterable like the map");
        assertEquals("[object Map]", Object.prototype.toString.call(fake), "Symbol.toStringTag is kept");
        fake.set("b", 2);
        assertEquals(2, map.get("b"), "MASK mode passes method calls through");

        const array = [1, 2];
        const fakeArray = Fakery(array);
        fakeArray.push(3);
        assertEquals([1, 2, 3], array, "Array methods run against the real array");
        assertEquals(3, fakeArray.length, "length reads through");
    });

    group("statics of a faked function", function () {
        function Widget() {}
        Widget.VERSION = "1.0";
        Widget.create = function () { return new this(); };
        const FakeWidget = Fakery(Widget);
        assertEquals("1.0", FakeWidget.VERSION, "static properties are readable");
        assert(FakeWidget.create() instanceof Widget, "static methods work");
        assertEquals(1, FakeWidget.numberOfCalls(), "`new this()` inside a static goes through the fake");
        assert(Fakery(Array).isArray([]), "built-in statics work (Array.isArray)");
        assert(Fakery(Promise).resolve(1) instanceof Promise, "built-in statics work (Promise.resolve)");
        assert(FakeWidget instanceof Fakery.Function, "the fake is still a Fakery.Function");
    });

    group("members the fake does not intercept", function () {
        class Host {
            #value = "inside";
            get value() { return this.#value; }
            set value(v) { this.#value = v; }
        }
        const host = new Host();
        const partial = new Fakery.FakeObject(host).applyProperties({});
        assertEquals("inside", partial.value, "inherited getters run with the original as `this`");
        partial.value = "changed";
        assertEquals("changed", host.value, "inherited setters run with the original as `this`");

        const fake = Fakery(new Host());
        const original = Fakery.unwrap(fake);
        assertEquals("inside", fake.value, "an unwrapped fake still reads accessors correctly");
        assert(original instanceof Host, "unwrap returned the instance");
    });

    group("constant overrides", function () {
        const fake = Fakery(makeDoc());
        fake.onArgsDo("title", "Constant");
        assertEquals("Constant", fake.title, "a value that is not a function is returned as is");
        fake.getElementById.onArgsDo(["x"], 0);
        assertEquals(0, fake.getElementById("x"), "for method calls too");
        Fakery.on(fake, "createElement", null);
        assertEquals(null, fake.createElement("div"), "and through Fakery.on");
        assertThrows(function () { fake.onArgsDo("title"); }, "a missing override still throws");
    });

    group("applyProperties", function () {
        const original = { a: 1, b: 2, secret: { cyclic: null } };
        original.secret.cyclic = original;
        const fake = new Fakery.FakeObject(original).applyProperties({ a: 1, b: 1 });
        assertEquals(["a", "b"], Object.keys(fake), "only the listed members become own properties");
        assertEquals('{"a":1,"b":2}', JSON.stringify(fake), "so JSON.stringify works on an object with cycles");
        assert(fake.secret === original.secret, "unlisted members are still readable");

        const withMethod = Fakery({ m: function () { return "real"; } });
        withMethod.m.onArgsDo(["x"], function () { return "fake"; });
        withMethod.applyProperties({ m: 1 });
        assertEquals("fake", withMethod.m("x"), "re-applying a member keeps its overrides");
    });

    group("hiding a method", function () {
        const fake = Fakery({ fetch: function () {} });
        fake.onArgsDo("fetch", function () { return undefined; });
        assertEquals("undefined", typeof fake.fetch, "a property override on a method name can make it look missing");
    });

    group("constructors", function () {
        function Point(x) { this.x = x; }
        class Shape { constructor(name) { this.name = name; } }
        const fake = Fakery({ Point: Point, Shape: Shape });
        const p = new fake.Point(3);
        assertEquals(3, p.x, "new works on a faked ES5 constructor");
        assert(p instanceof Point, "the instance has the original prototype");
        assert(p instanceof fake.Point, "instanceof works against the fake");
        assertEquals("box", new fake.Shape("box").name, "new works on a faked class");
        assertEquals(2, fake.Point.numberOfCalls() + fake.Shape.numberOfCalls(), "constructor calls are recorded");
    });

    group("forced this", function () {
        const target = { v: "target" };
        const fn = Fakery(function () { return this.v; }, target);
        assertEquals("target", fn.call({ v: "other" }), "a forced `this` wins over the call's own");
        const fake = Fakery({ v: "orig", get: function () { return this.v; } }, target);
        assertEquals("target", fake.get(), "a FakeObject passes its forced `this` to its methods");
    });

    group("resetHistory", function () {
        const fake = Fakery(makeDoc());
        void fake.title;
        fake.getElementById("a");
        fake.resetHistory();
        assertEquals(0, fake.numberOfCalls("title"), "reads are cleared");
        assertEquals(1, fake.getElementById.numberOfCalls(), "methods keep their history without propagate");
        fake.resetHistory(true);
        assertEquals(0, fake.getElementById.fake.numberOfCalls(), "propagate clears the methods' history too");
    });

    group("unwrap", function () {
        const doc = makeDoc();
        const fake = Fakery(doc);
        fake.onArgsDo("title", function () { return "fake"; });
        assert(Fakery.unwrap(fake) === doc, "unwrap returns the original object");
        assertEquals("Real title", fake.title, "the old fake now reads straight from the original");
        assert(!Fakery.FakeObject.instanceOf(fake), "and is no longer a FakeObject");

        const fn = function () { return "real"; };
        const fakeFn = Fakery(fn);
        fakeFn.onArgsDo(null, function () { return "fake"; });
        fakeFn();
        assert(Fakery.unwrap(fakeFn) === fn, "unwrap returns the original function");
        assertEquals("real", fakeFn(), "the old wrapper now calls straight through");
        assertEquals(1, fakeFn.numberOfCalls(), "history recorded before unwrap is kept");
        assertEquals(5, Fakery.unwrap(5), "non-fakes are returned unchanged");
    });

    group("argument matching (util_eq)", function () {
        const eq = Fakery.util_eq;
        assert(eq([1, "a", { b: [2] }], [1, "a", { b: [2] }]), "arrays and plain objects compare deeply");
        assert(!eq([1], [1, 2]), "different lengths differ");
        assert(!eq({ a: 1 }, { a: 1, b: undefined }), "different keys differ");
        assert(eq([NaN], [NaN]), "NaN matches NaN");
        assert(eq(new Date(5), new Date(5)) && !eq(new Date(5), new Date(6)), "Dates compare by time");
        assert(eq(/a/g, /a/g) && !eq(/a/g, /a/i), "RegExps compare by source and flags");
        function Box(v) { this.v = v; }
        assert(!eq(new Box(1), new Box(1)), "class instances match only themselves");
        const a = { name: "a" }; a.self = a;
        const b = { name: "a" }; b.self = b;
        assert(eq(a, b), "cycles do not overflow the stack");
    });

    group("host getters that throw", function () {
        const original = { ok: 1 };
        Object.defineProperty(original, "denied", {
            enumerable: true,
            get: function () { throw new Error("SecurityError"); }
        });
        const fake = Fakery(original);
        assertEquals(1, fake.ok, "faking still succeeds");
        assertThrows(function () { return fake.denied; }, "reading the throwing member throws as it would on the original");
    });

    if (typeof window !== "undefined" && typeof document !== "undefined") {
        group("browser: document", function () {
            const real = document.createElement("div");
            real.id = "fakery-real-element";
            document.body.appendChild(real);
            try {
                const fakeDoc = Fakery(document);
                fakeDoc.getElementById.onArgsDo(["my-id"], function () { return { src: "hi.js" }; });
                assertEquals("hi.js", fakeDoc.getElementById("my-id").src, "the overridden id returns the test object");
                assert(fakeDoc.getElementById("fakery-real-element") === real, "other ids reach the real document");
                assertEquals("SPAN", fakeDoc.createElement("span").tagName, "methods run with the real document as `this`");
                assertEquals(document.title, fakeDoc.title, "properties read through");
            } finally {
                real.remove();
            }
            const partial = new Fakery.FakeObject(window).applyProperties({ name: 1 });
            assert(partial.location === location, "an unfaked DOM accessor reads without \"Illegal invocation\"");
        });

        group("browser: replacing self", function () {
            const realSelf = self;
            const fakeDoc = Fakery(document);
            fakeDoc.getElementById.onArgsDo(["my-id"], function () { return { src: "hi.js" }; });
            // Code under test reaches the document through `self`, so the test can swap it.
            function getMyElementsSrcAttribute() {
                return self.document.getElementById("my-id").src;
            }
            try {
                self = Fakery(self);
                Fakery.on(self, "document", function () { return fakeDoc; });
                assertEquals("hi.js", getMyElementsSrcAttribute(), "code that uses self.document sees the fake document");
                assert(new self.Image() instanceof HTMLImageElement, "window constructors still work with new");
                assertEquals(1, self.Image.numberOfCalls(), "and constructor calls are recorded");
                assert(self.Promise.resolve(1) instanceof Promise, "statics of faked constructors work");
                const timer = self.setTimeout(function () {}, 0);
                self.clearTimeout(timer);
                assert(true, "window methods run with the real window as `this`");
                assertEquals(1, self.setTimeout.numberOfCalls(), "window method calls are recorded");
            } finally {
                self = Fakery.unwrap(self);
            }
            assert(self === realSelf, "unwrap gives back the real window");
        });
    }

    assert.testing.release();
    testOb.done();
}(test[_testFakery]));
