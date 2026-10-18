/*
 Basic usage: faking a browser global for one test.

 Fakery wraps a JavaScript object or function in a fake. The fake controls what property reads
 and function calls return, and records them.

 It is useful when the code under test reads globals you do not control, and you do not want to
 change that code just to make it testable. The main case is `document`, or a browser API such
 as `navigator`.

 Browsers will not let you replace those globals. These do nothing, or throw in strict mode:
   window.document = someFakeObject;
   window.document = Fakery(window.document);

 But `self` can be replaced. In a page, `self` is the global object (`self === window`), so these
 are the same object:
   self.document === window.document === document

 So write the code under test to reach browser globals through `self`:
   old source code:
     const agent = window.navigator.userAgent;
     const myElement = document.getElementById("the_id");
   new source code:
     const agent = self.navigator.userAgent;
     const myElement = self.document.getElementById("the_id");

 In production `self` is the real window. In a test, replace it with a fake, and restore it
 afterwards:
     self = Fakery(self);
     ...
     self = Fakery.unwrap(self);
*/

/*
 NOTE: for a property such as "document" these two lines are the same:
   Fakery.on(self, "document", function (fake, args) { return fakeDoc; });
   self.onArgsDo("document", function (fake, args) { return fakeDoc; });
 For a method name they differ. Fakery.on overrides every call to the method. onArgsDo overrides
 reading the method itself.
 */

// Pretend this function is in your test code.
function test_getMyElementsSrcAttribute() {
    // Create the fakes.
    const fakeDoc = Fakery(document);
    self = Fakery(self);
    try {
        // Make "self.document" return the fake document.
        Fakery.on(self, "document", function (fake, args) { return fakeDoc; });

        // Make self.document.getElementById("my-id") return a test object. Every other read and
        // call still goes to the real document.
        fakeDoc.getElementById.onArgsDo(["my-id"], function (fakeMethod, callArgs) {
            return { src: "hi.js", async: true };
        });
        // To return the test object for every call to getElementById, use null instead:
        // fakeDoc.getElementById.onArgsDo(null, function (fakeMethod, callArgs) { return {src: "hi.js"}; });

        // Now test the function.
        assertEquals("hi.js", getMyElementsSrcAttribute());
        assertEquals(1, fakeDoc.getElementById.numberOfCalls(["my-id"]));
    } finally {
        self = Fakery.unwrap(self);
    }
}

// Pretend this function is in your source code.
function getMyElementsSrcAttribute() {
    const ele = self.document.getElementById("my-id");
    return ele.src;
}
