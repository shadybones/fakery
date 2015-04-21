# Fakery - Mockery-like tool for JS Unit tests (QUnit, Jasmine, Karma, whatever...)
Javascript unit testing framework for mocking / proxying / masking javascript objects and functions.
Not for _running_ unit tests, I personally rely on JSTestDriver, it's for _within_ the tests you have.

An example would be to override the document.getElementById to return normally unless id="my_id", in which case return your test object/element instead.

#I wrote this in two days
Please don't be upset if some part of it doesn't work. Of course I've been bug fixing and adding small bits as I use it myself, but I can't guarantee anything.

#Notes for overriding / mocking Global Browser Objects (navigator, document, etc..)
Browsers don't just let you set these global objects. It's a security thing. Actually, the whole reason I made Fakery was to get around this.
You can use "self" instead of "window" in all your code, though. If you do that, you can override "self" with a Fake object in your tests, and you're golden.
See the "examples/basic_usage.js" file for further explanation and examples.

#Features
Override all methods, just a few, or just properties, on an object, using the MODE
Hide methods and properties on an object, or add to it without actually modifying the original object (using FakeObject.applyProperties)
Override all calls to a method, or just calls which match certain arguments.
Stores the complete history of calls to methods or property accesses.
Force override (bind) THIS objects in functions