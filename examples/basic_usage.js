/*
 Fakery wraps javascript objects and functions with a "proxy" which allows you to control what is returned
 by property references and function calls.

 This is because sometimes you don't have control over the global objects your tests use, and you don't want
 to pollute your code by "hacking" it.

 The most useful case is for use with "document" or browser controlled JS API calls (like "navigator" methods).
 To use this, it's good if you understand that in browsers and most other JS runtimes,
 "self" is a reference to "window" (the global object), and therefore interchangeable:
   self == window
   window.document == self.document

 Also, accessing variables that exist on the global object can be done in two ways: with or without referencing "window".
   for example:
      navigator == window.navigator
      addEventListener == window.addEventListener

 However, "window.document" and "window.navigator", and event "window.window" CANNOT BE REPLACED
 So you cannot do:
   window.document = {some_fake_object};
   window.doument = Fakery(window.document);

 Therefore if you wish to use Fakery in your tests on GLOBAL BROWSER OBJECTS, you must change the references in
 your source code to use "self" instead of "window". This way, the code will always work the way you want it to:
 it will use "window" while in production, and use a Fakery object while in tests.

 Example:
   old source code:
     var agent = window.navigator.userAgent;
     var myElement = document.getElementById("the_id");
   new source code:
     var agent = self.navigator.userAgent;
     var myElement = self.document.getElementById("the_id");
   and then just set "self" as your Fake object:
     self = Fakery(window);
*/

/*
 NOTE:
 Fakery.on(self,"document",function(a,b){return fakeDoc;});
 and
 self.onArgsDo("document",function(a,b){return fakeDoc;});
 are equivalent. I use both methods for example purposes.
 */

//pretend this function is in your test code
function test_getMyElementsSrcAttribute(){
    //Create your Fake objects
    var fakeDoc = Fakery(document);
    self = Fakery(self);
    //Make "self.document" return your fakeDoc
    Fakery.on(self,"document",function(a,b){return fakeDoc;});
    //Make "self.document.getElementById('my-id')" return a test object
    //but every other reference / access / method call will actually go to the REAL document object.
    fakeDoc.getElementById.onArgsDo(["my-id"],function(fakeObject, originalArgs){ return {src:"hi.js", async:true}; });
    /**
     * Alternative to the line above would be to return the test object for ALL calls to getElementById
     * fakeDoc.getElementById.onArgsDo(null, function(fakeObject, originalArgs){ return {src:"hi.js", async:true}; });
     */

    //now test the function
    assertEquals("hi.js", getMyElementsSrcAttribute());
}
//pretend this function is in your source code
function getMyElementsSrcAttribute(){
    var ele = self.document.getElementById("my-id");
    return ele.src;
}