(function() {
    /**
     * Test that the truth value is truthy. IF no description, then this
     * is assumed to be a chain assert and will return a chain object
     * instead of running the test.
     *
     * assert(1).equals(2, "test1")
     * is equivalent to
     * assertEquals(1,2,"test1")
     *
     * @param truth {Boolean}
     * @param desc {String=} A description of the current test. If absent, this is assumed to be a chain assert
     * @param testname {String=} The name of this test. Generally the class and method it's testing.
     * @param testOb {Object=} The Test object (has ob.results[])
     * @param errorInfo {*} data to add to the error print out, if assert fails
     * @returns {{testname: (*|String), testOb: (*|Object), value: *, equals: equals}}
     */
    function assert(truth, desc, testname, testOb, errorInfo) {
        testname = testname || assert._testname;
        testOb = testOb || assert._testOb;

        if (desc !== undefined) {  //normal assert true
            if (!truth) {
                var e = new Error((testname ? ("Testing " + testname + ":  ") : '') + (errorInfo || "This was not true") +". "+ desc);
                self.console && self.console.error(e);
            }
            if (testOb) {
                testOb.result.push(new TestResult(truth, desc, testname, e));
            }
        }
        else { //chain assert
            return {
                testname: testname,
                testOb: testOb,
                value: truth,
                equals: function (a, desc) {
                    return assertEquals.call(this, a, undefined, desc);
                }
            }
        }
    }

    /**
     * Tests for equality of structure and values;
     * @param a {*}
     * @param b {*}
     * @param desc {String=} A description of the current test
     * @param testname {String=} The name of this test. Generally the class and method it's testing.
     * @param testOb {Object=} The Test object (has ob.results[])
     */
    function assertEquals(a, b, desc, testname, testOb) {
        if (b === undefined) { //chain
            b = a;
            a = this.value;
            testname = this.testname;
            testOb = this.testOb;
        }
        assert(assert._equals(a, b), desc || "Was Equal", testname, testOb, "Expected: "+(b instanceof Object ? JSON.stringify(b):b) +", but got: "+(a instanceof Object ? JSON.stringify(a):a));
    }

    /**
     * For testing a function which is supposed to throw an exception
     * @param fun {Function} The function which is supposed to throw an exception when called.
     * @param desc {String=} A description of the current test
     * @param testname {String=} The name of this test. Generally the class and method it's testing.
     * @param testOb {Object=} The Test object (has ob.results[])
     */
    function assertThrows(fun, desc, testname, testOb) {
        if (fun instanceof Function) {
            try {
                fun();
                assert(false, desc || "Didn't Throw", testname, testOb);
            } catch (e) {
                assert(true, desc || "Threw", testname, testOb);
            }
        } else {
            throw new Error("Illegal Args. Requires a function");
        }
    }

    /**
     * a generous equality - equality of structure and values
     * @param a {*}
     * @param b {*}
     * @returns {boolean}
     * @private
     */
    function _equals(a, b) {
        if (a === b) return true;
        if (typeof a != typeof b) return false;
        if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;
        if (a.equals && b.equals) return a.equals(b);
        if (Array.isArray(a)) {
            if (a.length != b.length) return false;
            for (var i = a.length; i-- > 0;) {
                if (!assert._equals(a[i], b[i])) return false;
            }
            return true;
        } else if (a instanceof RegExp || a instanceof Date) {
            return a.toString() == b.toString();
        } else if (a instanceof Object) {
            var keys = Object.keys(a);
            if (keys.join('$') != Object.keys(b).join('$')) return false;
            for (i = keys.length; i-- > 0;) {
                if (!assert._equals(a[keys[i]], b[keys[i]])) return false;
            }
            return true;
        } else return false;
    }

    /**
     *
     * @param value {*}
     * @param desc {String}
     * @param testname {String}
     * @param error {Error=}
     * @constructor
     */
    function TestResult(value, desc, testname, error){
        this.value = value;
        this.desc = desc;
        this.testname = testname;
        this.error = error;

        if(error){
            var match = error.stack.match(/at <[^>]+>:\d+:\d+\s*(at <([^>]+)>:(\d+):(\d+))/),
                top = error.stack.substring(error.stack.lastIndexOf("at "));
            this.errorSource = top;
        }
    }

    /**
     * Set the default test name and test ob.
     * @param desc {String} The name of this test. Generally the class and method it's testing.
     * @param testOb {Object=} The Test object (has ob.results[])
     */
    assert.testing = function(desc, testOb){
        assert._testname = desc;
        testOb!==undefined && (assert._testOb = testOb);
    };
    assert.testing.release = function(){ assert.testing("",null); };
    assert._equals = _equals;

    if(typeof define == 'function'){
        define(function(){
            return {
                assert : assert,
                assertEquals : assertEquals,
                assertThrows : assertThrows
            }
        });
    }else{
        var exp = typeof exports != 'undefined' ? exports : self;
        exp.assert = assert;
        exp.assertEquals = assertEquals;
        exp.assertThrows = assertThrows;
    }

})();