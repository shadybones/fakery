/**
 * @file CommonJS entry point (`require("fakery-js")`). Loads all three libraries and re-exports them.
 *
 * Loading this has side effects: Catchy and Testy add methods to every function (see Catchy.js
 * and Testy.js). To get Fakery alone, require "fakery-js/src-js/Fakery" instead.
 */
"use strict";

exports.Catchy = require("./Catchy").Catchy;
exports.Testy = require("./Testy").Testy;
exports.Fakery = require("./Fakery").Fakery;
