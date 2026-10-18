/*
    A JsTestDriver test case that uses Fakery, for this production code:

         getScriptElement = function(search) {
             if(typeof search == "string"){
                search = new RegExp(search);
             }
             if(!(search instanceof RegExp)) return null;
             const list = self.document.getElementsByTagName("script");
             for (let a, i = list.length; i-- > 0 && (a = list[i]); ) {
                 if( search.test(a.src) )
                    return a;
             }
             return null;
         };

         getJSON = function(ob){
             if(self.JSON) return self.JSON.stringify(ob);
             else{
                 let myjson = "";
                 ... my json stringifying code ...
                 return myjson;
             }
         };

    The production code reaches the document and JSON through `self`, so setUp can swap `self`
    for a fake and tearDown can restore it.
 */
MyUtil = TestCase("MyUtil");

MyUtil.prototype.setUp = function () {
    const fakeDoc = Fakery(document);
    const fakeLoc = Fakery(location);
    const fakeNav = Fakery(navigator);
    self = Fakery(self);
    Fakery.on(self, "document", function (fake, args) { return fakeDoc; });
    Fakery.on(self, "location", function (fake, args) { return fakeLoc; });
    Fakery.on(self, "navigator", function (fake, args) { return fakeNav; });
};

MyUtil.prototype.tearDown = function () {
    self = Fakery.unwrap(self);
};

MyUtil.prototype.test_getScriptElement = function test_getScriptElement() {
    const testset = { current: [] };
    Fakery.on(self.document.getElementsByTagName, ["script"], function (fakeMethod, args) {
        return testset.current;
    });

    // bad input
    assertNull(getScriptElement());
    assertNull(getScriptElement(null));
    assertNull(getScriptElement({}));
    assertNull(getScriptElement([]));
    assertNull(getScriptElement(5));

    // no elements
    assertNull(getScriptElement(""));

    // valid input
    testset.current = [{ src: "xyz" }];
    assertEquals(testset.current[0], getScriptElement(""));
    assertEquals(null, getScriptElement("a"));
    testset.current = [{}];
    assertEquals(testset.current[0], getScriptElement(""));
    assertEquals(null, getScriptElement("a"));
    testset.current = [{ src: "" }];
    assertEquals(testset.current[0], getScriptElement(""));
    assertEquals(null, getScriptElement("a"));
    testset.current = [{ src: "xyz" }, { src: "abc" }];
    assertEquals(testset.current[0], getScriptElement("x"));
    assertEquals(testset.current[1], getScriptElement("a"));
    const a = getScriptElement("");
    assertTrue(a === testset.current[0] || a === testset.current[1]);
};

MyUtil.prototype.test_getJSON = function test_getJSON() {
    const fakeJSON = Fakery(window.JSON);
    const current = { json: fakeJSON };

    // Make self.JSON return whatever current.json holds.
    Fakery.on(self, "JSON", function (fake, args) { return current.json; });

    getJSON({});
    assertEquals(1, fakeJSON.stringify.numberOfCalls([{}]));
    getJSON({ a: 1 });
    assertEquals(1, fakeJSON.stringify.numberOfCalls([{ a: 1 }]));
    assertEquals(2, fakeJSON.stringify.numberOfCalls());
    fakeJSON.stringify.resetHistory();

    // Pretend the browser has no JSON: getJSON must fall back to its own code.
    current.json = null;
    getJSON({});
    const result = getJSON({ a: 1 });
    assertEquals(0, fakeJSON.stringify.numberOfCalls());
    assertEquals('{"a":1}', result);
};
