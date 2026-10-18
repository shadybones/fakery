/*
 Catchy and Testy, the two helper libraries that ship with Fakery. Runs in a browser or Node,
 once Catchy and Testy are loaded.
 */

// --- Catchy: watch a function without editing it
function save(record) {
    return "saved " + record.id;
}
const calls = [];
const watchedSave = save.then(function (record, result) { calls.push(result); });  // runs after each successful call
watchedSave({ id: 1 });                  // "saved 1"
calls;                                   // ["saved 1"]
// In a browser script `save` is also a global, so Catchy replaced it there: calling save() is watched too.

// --- Catchy: turn errors into a return value
function parse(text) {
    return JSON.parse(text);
}
const safeParse = Catchy.wrap(parse).catch(function (error, caught, source, args) {
    return null;                         // what the call returns when parse throws
});
safeParse("{bad json");                  // null
safeParse('{"ok":true}');                // {ok: true}

// --- Catchy: run something first, or swap the body
const log = [];
const fetchUser = Catchy.wrap(function (id) { return { id: id, name: "real" }; })
    .first(function (id) { log.push("fetching " + id); })
    .override(function (id) { return { id: id, name: "test double" }; });
fetchUser(7);                            // {id: 7, name: "test double"}; log is ["fetching 7"]

// --- Catchy: a synchronous, promise-like result
parse.promisify()('{"a":1}')
    .then(function (value) { return value.a; })
    .then(function (a) { /* a === 1, and this ran immediately */ });

// --- Catchy in promise-based code: uninstall it, keep using wrap()
Catchy.uninstall();                      // functions no longer have then/catch/..., so await works again
Catchy.wrap(save).then(function () {});  // still fine

// --- Testy: fix arguments by position
function area(width, height, unit) {
    return width * height + " " + unit;
}
const squareMetres = area.bindArgs([undefined, undefined, "m2"]);
squareMetres(3, 4);                      // "12 m2"
Testy.bindArgs(area, [2])(99, 5, "cm2"); // "10 cm2": the 99 is replaced by the bound 2

// --- Testy: drop a return value
function validate(form) {
    return false;                        // "invalid"
}
validate.mute()({});                     // undefined
// jQuery reads a handler's `false` as "prevent default and stop propagation"; a muted handler
// cannot do that by accident:  $(form).on("submit", validate.mute());
