#!/usr/bin/env node
/**
 * @file Runs the test suites in this folder under Node (`npm test`).
 *
 * The suites are written for the browser harness (test.html), so this sets up the same globals
 * the harness provides: the libraries, the assert helpers, the `test` registry, and a
 * `_test<Name>` pointer for each suite. A suite may finish asynchronously; it has
 * SUITE_TIMEOUT_MS to call done(). Tests that need a real DOM skip themselves. The exit code
 * is 1 if any assertion fails or a suite does not finish.
 */
"use strict";

const path = require("path");

const SUITES = ["Catchy", "Fakery", "Testy"];
const SUITE_TIMEOUT_MS = 5000;
const lib = (name) => require(path.join(__dirname, "..", "src-js", name))[name];

Object.assign(global, require("./test-asserts"));
global.Catchy = lib("Catchy");
global.Fakery = lib("Fakery");
global.Testy = lib("Testy");
global.test = {};

/** Loads one suite and waits for it to call done(). Returns its counts. */
async function runSuite(name) {
    let finished;
    const done = new Promise((resolve) => { finished = resolve; });
    const suite = {
        name: name,
        result: [],
        isComplete: false,
        done() {
            this.isComplete = true;
            finished();
        }
    };
    global.test[name] = suite;
    global["_test" + name] = name;

    console.log(`\n${name}`);
    try {
        require(`./${name}.test.js`);
    } catch (error) {
        console.error(`  suite crashed: ${error && error.stack || error}`);
    }
    let timer;
    await Promise.race([done, new Promise((resolve) => { timer = setTimeout(resolve, SUITE_TIMEOUT_MS); })]);
    clearTimeout(timer);

    const counts = { passed: 0, failed: 0 };
    for (const result of suite.result) {
        if (result.error) {
            counts.failed++;
            console.log(`  FAIL  ${result.testname}: ${result.desc}`);
        } else {
            counts.passed++;
            console.log(`  ok    ${result.testname}: ${result.desc}`);
        }
    }
    if (!suite.isComplete) {
        counts.failed++;
        console.log("  FAIL  suite did not finish");
    }
    return counts;
}

(async () => {
    let passed = 0;
    let failed = 0;
    for (const name of SUITES) {
        const counts = await runSuite(name);
        passed += counts.passed;
        failed += counts.failed;
    }
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exitCode = failed ? 1 : 0;
})();
