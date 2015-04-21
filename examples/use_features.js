//Override one method / property, but let other calls/property return as if from the original
self = Fakery(self);
Fakery.on(self,"name",function(a,b){return "my_name";});
Fakery.on(self.eval, null, function(a,b){ return "i dont think so"; });

//OR, make everything return null except what you specifically override
Fakery.mode = Fakery.MODES.HOLLOW;

//OR dont override anything because you just want to keep track of access, not override
self = Fakery(window);
var fakeDoc = Fakery(document);
self.onArgsDo("document",function(a,b){ return fakeDoc;  });
self.document.getElementById("something");
self.document.getElementById.numberOfCalls() == 1;
self.document.getElementById.fake.history == [["something"]];

//Only override a method when it matches certain args
self.document.getElementById.onArgsDo(["my-id"],function(a,b){ var fakeResult = []; return fakeResult; });

//OR do it yourself manually
self.document.getElementById.onArgsDo(null,
    //a = fake object, b = args
    function(a,b){
        if(b[0]=="my-id") {
            var fakeResult = [];
            return fakeResult;
        }else return document.getElementById.apply(document,b);
    });

//Change the Fakery Mode (see Fakery.js comments for details)
Fakery.mode = Fakery.MODES.HOLLOW; //Globally
self = Fakery(self);
self.mode(Fakery.MODES.MASK); //On one Fake object only

//Hide properties or methods on an object for tests
JSON.stringify(self); //ERROR!!!!
self = new FakeObject(window).applyProperties({var_I_care_about:1, other_var_I_care_about:2});
JSON.stringify(self); // OK!!

//Add properties to the fake object that look like they are on the original
var fakeLocalStorage = Fakery(window.localStorage);
window.localStorage == {var1:"sdf", var2:1234};
fakeLocalStorage.applyProperties({var4:1});
fakeLocalStorage.onArgsDo("var3",function(a,b){return "I got it";});
window.localStorage == {var1:"sdf", var2:1234};
fakeLocalStorage.var4 === null ;//(NOT undefined)
fakeLocalStorage.var3 == "I got it";
fakeLocalStorage.var2 == 1234;
fakeLocalStorage.var1 == "sdf";
Fakery.on(self,"localStorage",function(a,b){return fakeLocalStorage;});

