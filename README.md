# Fakery - Because I don't like Jasmine and QUnit
Javascript unit testing framework for mocking / covering / masking javascript objects and functions.
Currently it's not for running unit tests, I personally rely on JSTestDriver, it's for within the tests you have.

An example would be to override the document.getElementById to return normally unless id="my_id", in which case return your object/element instead.

#I wrote this in two days
Please don't be upset if some part of it doesn't work.