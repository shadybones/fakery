/*
 A tour of Fakery's features, in a browser. Each section stands alone; the comments give the
 value each expression evaluates to.
 */

// --- Override one property or method; everything else behaves as normal (MASK mode, the default)
self = Fakery(self);
Fakery.on(self, "name", function (fake, args) { return "my_name"; });
Fakery.on(self, "eval", function (fakeMethod, args) { return "i dont think so"; });
self.name;                 // "my_name"
self.eval("1 + 1");        // "i dont think so"
self.location.href;        // the real URL
self = Fakery.unwrap(self);

// --- Only record; override nothing (FULL mode)
const watched = Fakery(window).mode(Fakery.MODES.FULL);
const fakeDoc = Fakery(document);
watched.onArgsDo("document", function (fake, args) { return fakeDoc; });  // ignored in FULL mode
watched.document === document;                       // true: FULL mode ignores overrides
watched.numberOfCalls("document");                   // 1
fakeDoc.getElementById("something");
fakeDoc.getElementById.numberOfCalls();              // 1
fakeDoc.getElementById.fake.history;                 // [["something"]]

// --- Override a method only for certain arguments
fakeDoc.getElementById.onArgsDo(["my-id"], function (fakeMethod, args) { return { id: "fake" }; });
fakeDoc.getElementById("my-id");                     // {id: "fake"}
fakeDoc.getElementById("other");                     // the real element, or null

// --- OR handle every call yourself, and pass some through
fakeDoc.getElementById.onArgsDo(null, function (fakeMethod, args) {
    if (args[0] === "my-id") {
        return { id: "fake" };
    }
    return document.getElementById.apply(document, args);
});

// --- Change the mode
Fakery.mode = Fakery.MODES.HOLLOW;                   // globally: hide everything not overridden
const hollowDoc = Fakery(document);
hollowDoc.title;                                     // null
hollowDoc.getElementById("x");                       // null
hollowDoc.mode(Fakery.MODES.MASK);                   // on one fake only
hollowDoc.title;                                     // the real title
Fakery.mode = Fakery.MODES.MASK;                     // back to the default

// --- Expose only some members, e.g. so the fake can be serialised
JSON.stringify(window);                              // throws: window has cycles
const partial = new Fakery.FakeObject(window).applyProperties({ name: 1, innerWidth: 1 });
JSON.stringify(partial);                             // '{"name":"...","innerWidth":...}'
partial.location === location;                       // true: unlisted members are still readable, just not intercepted

// --- Add members to the fake without touching the original
const fakeStorage = Fakery(window.localStorage);      // say localStorage holds {var1: "sdf", var2: "1234"}
fakeStorage.applyProperties({ var4: 1 });
fakeStorage.onArgsDo("var3", function (fake, args) { return "I got it"; });
fakeStorage.var3;                                    // "I got it"
fakeStorage.var4;                                    // undefined: the original has no var4 (null in HOLLOW mode)
fakeStorage.var1;                                    // "sdf"
"var3" in window.localStorage;                       // false: the real storage is untouched

// --- Make an API look missing (for feature-detection code)
const noFetch = Fakery(window);
noFetch.onArgsDo("fetch", function (fake, args) { return undefined; });
typeof noFetch.fetch;                                // "undefined"

// --- Return a fixed value: pass it instead of a callback
const fixedDoc = Fakery(document);
fixedDoc.onArgsDo("title", "Test title");
fixedDoc.getElementById.onArgsDo(["missing"], null);
fixedDoc.title;                                      // "Test title"
fixedDoc.getElementById("missing");                  // null

// --- Replace a method on the fake only
const stubbed = Fakery(document);
stubbed.querySelector = function (selector) { return null; };
stubbed.querySelector("body");                       // null
document.querySelector("body");                      // the real body: the original is untouched
stubbed.querySelector.numberOfCalls();               // 1
