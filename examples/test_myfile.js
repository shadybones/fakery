/*
    JS Test Driver test file

    for

    production js:

         getScriptElement = function(search) {
             if(typeof search == "string"){
                search = new RegExp(search);
             }
             if(!(search instanceof RegExp)) return null;
             var list = self.document.getElementsByTagName("script"),
                r = (search && search.test) ? search : new RegExp(search);
             for(var a, i = list.length; i-- > 0 && (a = list[i]); ) {
                 if( r.test(a.src) )
                    return a;
             }
             return null;
         };

         getJSON = function(ob){
             if(self.JSON) return self.JSON.stringify(ob);
             else{
                 var myjson = "";
                 ... my json stringifying code ...
                 return myjson;
             }
         };

 */
MyUtil = TestCase("MyUtil");

MyUtil.prototype.setUp = function(){
    var fakeDoc = Fakery(document);
    var fakeLoc = Fakery(location);
    var fakeNav = Fakery(navigator);
    self = Fakery(self);
    Fakery.on(self,"document",function(a,b){return fakeDoc;});
    Fakery.on(self,"location",function(a,b){return fakeLoc;});
    Fakery.on(self,"navigator",function(a,b){return fakeNav;});
};

MyUtil.prototype.tearDown = function(){
    self = Fakery.unwrap(self);
};

MyUtil.prototype.test_getScriptElement = function test_getScriptElement() {
    jstestdriver.console.log("starting the test: ", arguments.callee.name);

    var testset = {current:[]};
    Fakery.on(self.document.getElementsByName, ["script"], function(a,b){ return testset.current; });

    //test bad
    assertNull(getScriptElement());
    assertNull(getScriptElement(null));
    assertNull(getScriptElement({}));
    assertNull(getScriptElement([]));
    assertNull(getScriptElement(5));

    //test no elements
    assertNull(getScriptElement(""));

    //test valid
    testset.current = [{src:"xyz"}];
    assertEquals(testset.current[0], getScriptElement("") );
    assertEquals(null, getScriptElement("a") );
    testset.current = [{}];
    assertEquals(testset.current[0], getScriptElement("") );
    assertEquals(null, getScriptElement("a") );
    testset.current = [{src:""}];
    assertEquals(testset.current[0], getScriptElement("") );
    assertEquals(null, getScriptElement("a") );
    testset.current = [{src:"xyz"},{src:"abc"}];
    assertEquals(testset.current[0], getScriptElement("x") );
    assertEquals(testset.current[1], getScriptElement("a") );
    var a = getScriptElement("");
    assertTrue(a === testset.current[0] || a === testset.current[1]);
};
MyUtil.prototype.test_getJSON = function test_getJSON(){
    jstestdriver.console.log("starting the test: ", arguments.callee.name);

    var f = getJSON;
    var fakeJSON = Fakery(window.JSON);
    var fake = {json:fakeJSON};
    self = Fakery(window);

    //because parse and stringify are NOT PROPERTIES OF window.JSON (not returned in the for..in loop)
    //despite the fact that they ARE properties of window.JSON, as we all know
    fake.json.applyProperties({parse:1,stringify:1});

    //Same thing for window.JSON, believe it or not. It's not returned in a for(var s in window) loop.
    self.applyProperties({JSON:1});

    Fakery.on(self,"JSON",function(a,b){ return fake.json; });

    f({});
    assertEquals(1, self.JSON.stringify.numberOfCalls([{}]));
    f({a:1});
    assertEquals(1, self.JSON.stringify.numberOfCalls([{a:1}]));
    assertEquals(2, self.JSON.stringify.numberOfCalls());
    fakeJSON.stringify.resetHistory();

    fake.json = null;
    f({});
    var result = f({a:1});
    assertEquals(0, self.JSON.stringify.numberOfCalls());
    assertTrue(window.JSON.stringify(result), Fakery.util_eq(result, {a:1}));
};