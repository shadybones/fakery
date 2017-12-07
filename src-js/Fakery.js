/**
 * Creates a mask, or a sort of Proxy, over an object. All the properties and methods on the object are
 * duplicated on the mask and calls/accesses to these will behave according to the Mode Fakery is currently in.
 * @param {Object} ob The Object to be masked
 * @param {Object=} _th Object to be forced as the "this" reference in masked functions.
 * @returns {Fakery.FakeObject|Fakery.Function}
 */
Fakery = function fake(ob,_th){
    return fake.init(ob,_th);
};
/**
 * MODES: Very important
 *
 * Mask mode: The fake object will mask the underlying object. Only properties/methods which you have
 *            used in "onArgsDo" (overridden) will be overridden, others will use the original object.
 *
 * Hollow mode: The fake object will hide the underlying object. Only properties/methods which you have
 *            used in "onArgsDo" (overridden) will be overridden and actually return something.
 *
 * Full mode: The fake object will only keep track of method calls and property accesses. Nothing will be overridden.
 *
 * Properties-only mode : The fake object will use HOLLOW mode for methods, and FULL mode for properties.
 *
 * DEFAULT to MASK mode.
 *
 *  @final
 */
Fakery.MODES = { MASK: 1, HOLLOW: 2, FULL: 3, PROPERTIES_ONLY: 4 };
Fakery.mode = Fakery.MODES.MASK;

/**
 * On calling this method or property, call this callback and return what it returns.
 * The Fake Object can be anything returned by calling Fakery.
 *
 * To set a callback for all calls to a method, you must either use onArgsDo directly on the object,
 * OR pass it's parent object here and it's name as the argsOrProperty.
 *
 *
 * @param {(Fakery.Fake|Fakery.Function)} fakeOb An object returned by a call to Fakery.
 * @param {Array|String} argsOrProperty IF this is a method, then these are the args which must be matched.
 *                                      If this is a property, then this is a property name.
 * @param {Fakery.ActionCallback} doThis Callback which returns whatever you want this call to return;
 */
Fakery.on = function(fakeOb, argsOrProperty, doThis){
    if(!fakeOb || !doThis) throw new Error("invalid arguments");
    if(fakeOb instanceof Fakery.Function) {
        fakeOb = fakeOb.fake;
    }
    if( Fakery.FakeObject.instanceOf(fakeOb) && argsOrProperty!=null && typeof argsOrProperty.valueOf() == "string") {
        var prop = fakeOb._f_innermethods[argsOrProperty] || fakeOb.original()[argsOrProperty];
        if(prop instanceof Fakery.Function) {
            return prop.fake.onArgsDo(null, doThis);
        }else{
            return fakeOb.onArgsDo(argsOrProperty, doThis);
        }
    }
    if( fakeOb instanceof Fakery.FakeMethod && (argsOrProperty instanceof Array || argsOrProperty === null)){
        return fakeOb.onArgsDo(argsOrProperty, doThis);
    }
    throw new Error("invalid argument types. If FakeMethod, args must be an array. If FakeObject, must be a string");
}

/**
 * Creates the Fake object.
 *
 * If the passed object is already a Fake object, then just returns it back instead.
 *
 * @param {Object} ob Object on which to turn it's properties into Fake objects
 * @param {Object} _th Force functions to use this as their "this"
 * @returns {Fakery.FakeObject|Fakery.Function}
 */
Fakery.init = function init(ob,_th){
    if( !ob )
        throw new Error("required argument missing");

    //Check if already a Fake object
    if( Fakery.FakeObject.instanceOf(ob) || ob instanceof Fakery.Function )
        return ob;
    if( ob instanceof Fakery.FakeMethod )
        return ob.get();

    //Valid object (so far), make new
    if(typeof ob == "function"){
        return new Fakery.FakeMethod(ob,_th).get();
    }else{
        return new Fakery.FakeObject(ob,_th).applyProperties(ob);
    }
};
/**
 * Undo the Fakery wrapping
 * @param {(Fakery.Fake|Fakery.Function)} fakeOb
 */
Fakery.unwrap = function unwrap(fakeOb){
    if(fakeOb instanceof Fakery.Function){
        var temp = fakeOb.fake;
        delete fakeOb.fake;
        fakeOb = temp;
    }
    if( fakeOb instanceof Fakery.Fake || Fakery.FakeObject.instanceOf(fakeOb)) {
        var temp = fakeOb.original();
        for(var prop in fakeOb){
            delete fakeOb[prop];
        }
        fakeOb = temp;
    }
    return fakeOb;
};

/**
 * Function must accept two parameters.
 * The first is the Fake object attached.
 * Second is an Array:
 *      For a FakeObject, if the array is length 1 then it was a GET operation. Else was a SET. The first index of the array is the property name.
 *      For a FakeMethod, the array is the arguments passed into the function. You can use the Fake object to obtain the method's name.
 * @typedef {function(Fakery.Fake,Array)} */
Fakery.ActionCallback;
/** @typedef {{args:(Array|String),callback:Fakery.ActionCallback}} */
Fakery.ActionEntry;

/**
 * Interface / Abstract superclass for FakeObject and FakeMethod
 * @interface
 */
Fakery.Fake = function Fake(){};
/**
 * Returns the original object
 * @returns {Object} The original object which was passed to Fakery.
 */
Fakery.Fake.prototype.original = function(){};
/**
 * When this property / these arguments  are accessed / called on this Fake object, do this action (make this callback).
 * The doThis callback should return whatever the property access / method call should return.
 * @param {(Array|String)} property On this property access, or in the case of a method, on these arguments
 * @param {Fakery.ActionCallback} doThis Call this function. The Function will be passed the args (or value) and the response will be forwarded to the original caller.
 * @throws {Error} on invalid parameters
 */
Fakery.Fake.prototype.onArgsDo = function(property, doThis){};
/**
 * checks to see if an argument / doThis pair have been submitted by Fakery.on on this Fake object.
 * @param {(Array|String)} args
 * @returns {Fakery.ActionEntry} if one exists for this args parameter.
 */
Fakery.Fake.prototype.hasAction = function(args){};
/**
 * Counts the number of times a certain property acces (FakeObject) or arguments (FakeMethod) has been made.
 * Does not count "sets" for object properties. If null or invalid argument for FakeMethod, equivalent to "*" (any).
 * @param {(Array|String)} args
 * @returns number
 * @throws {Error} on invalid argument
 */
Fakery.Fake.prototype.numberOfCalls = function(args){};
/**
 * Returns the current call state of the object.
 * @returns {Fakery.State}
 */
Fakery.Fake.prototype.state = function(){};
/**
 * Gets/sets the Fakery.mode for this particular Fake object. This overrides Fakery.mode.
 * If mode parameter is defined, sets. Else gets the mode.
 * @param {number=} mode the mode to use when setting
 */
Fakery.Fake.prototype.mode = function(mode){};
/**
 * Resets the history tracking properties of the Fake Object. Returns calls / reads / writes to 0.
 * @param {boolean} propagate For Fake Objects, this will trigger a resetHistory call to all contained Fake Methods.
 */
Fakery.Fake.prototype.resetHistory = function(propagate){};




/**
 * FakeObject is the main Fake class
 * @param originalObject
 * @param originalThis
 * @constructor
 * @implements {Fakery.Fake}
 */
Fakery.FakeObject = function FakeObject(originalObject, originalThis){
    if(typeof originalObject != "object" || originalObject instanceof Fakery.Fake)
        throw new Error("incorrect type or missing required arguments for new instance");
    if( originalThis!=null && typeof originalThis !="object")
        throw new Error("incorrect argument type");

    this._f_o = originalObject;
    this._f_t = originalThis;
    /**
     * @type {Array<Fakery.FakeMethod>}
     * @private
     */
    this._f_innermethods = [];
    /**
     * Keeps track of the number of occurances of access to each property / method
     * @type {Object<string,number>}
     * @private
     */
    this._f_read = {};
    this._f_write = {};
    /**
     * Repository of Fakery.on calls for this FakeMethod.
     * @type {Object<String,Fakery.ActionEntry>}
     * @private
     */
    this._f_actions = {};
    /** @type {number} */
    this._f_mode = 0;

    //Create a copy of FakeObject prototype, to replace this's prototype.
    //So that original object can be made a __proto__ of that.
    var it, copy = {};
    for(var prop in Fakery.FakeObject.prototype){
        it = Fakery.FakeObject.prototype[prop];

        if(typeof it == "function")  // ok to direct reference, since FINAL
            copy[prop] = it;
        else{ // other stuff might not be final, so use getter/setters
            copy[prop].__defineGetter__(prop, function(){
                return Fakery.FakeObject.prototype[prop];
            });
            copy[prop].__defineSetter__(prop, function(value){
                return Fakery.FakeObject.prototype[prop] = value;
            });
        }
    }
    copy.__proto__ = originalObject;
    this.__proto__ = copy;
};
Fakery.FakeObject.instanceOf = function isInstanceOfFakeObject(item){
    return item && item._f_o instanceof Object;
};
/**
 * The passed parameter's properties will be used as a 'mask' to apply to the Fake object's overrides.
 * What this means is that if a property exists on 'copy', then that property will exist on the Fake object
 * to hide access to the original object's property of the same name. If a property exists on the original
 * object which does not exist on 'copy', then accessing FakeObject.property will actually access the original
 * object's property instead. This is useful for when you wish for some properties of the original object to be
 * directly accessible.
 *
 * Generally, you shouldn't use this method, and 'copy' should be the original object. But sometimes you
 * don't want a property of the original object on the Fake object. And sometimes you want to add properties
 * to the Fake object you can't (or dont want to) add to the original.
 *
 * @param {Object<String,*>} copy
 * @returns {Fakery.FakeObject} this
 */
Fakery.FakeObject.prototype.applyProperties = function(copy){
    if(!copy) return this;
    for(var prop in copy){
        if(prop in Fakery.FakeObject.prototype) continue;
        if( typeof this._f_o[prop] != "function" ){
            this.defineGettersSetters(prop);
        }else{
            var fm = this._f_o[prop];
            //if for some reason this function has already been transformed into a FakeMethod
            if(!(fm instanceof Fakery.Function)){
                fm = new Fakery.FakeMethod(fm || copy[prop], this._f_t || this._f_o).get();
            }
            this._f_innermethods.push(this._f_innermethods[prop] = fm.fake);
            this.defineGettersSetters(prop, Fakery.MODES.FULL);
        }
    }
    return this;
};
Fakery.FakeObject.prototype.original = function(){
    return this._f_o;
};
Fakery.FakeObject.prototype.hasAction = function(property){
    if(property in this._f_actions){
        return this._f_actions[property];
    }
    return null;
};
Fakery.FakeObject.prototype.onArgsDo = function(args, doThis){
    if(!args || typeof args.valueOf() != "string") throw new Error("missing first parameter or incorrect type: "+args);
    if(typeof doThis != "function" || (doThis.length!=null && doThis.length!=2)) throw new Error("missing callback or callback is of incorrect type (must accept 2 parameters).");
    var entry = this.hasAction(args);
    if(entry){
        entry.callback = doThis;
    }else{
        this._f_actions[args] = {args:args,callback:doThis};
        if(!(args in this.original())){
            var b = {};
            b[args] = 1;
            this.applyProperties(b);
        }
    }
};
Fakery.FakeObject.prototype.numberOfCalls = function(args){
    if(typeof args == "string"){
        return this._f_read[args] | 0;
    }
    throw new Error("invalid argument: "+args);
};
Fakery.FakeObject.prototype.numberOfWrites = function(args){
    if(typeof args == "string"){
        return this._f_write[args] | 0;
    }
    throw new Error("invalid argument: "+args);
};
Fakery.FakeObject.prototype.mode = function(mode){
    if(mode==null) return this._f_mode;
    if(mode < 4)
        this._f_mode = mode;
};
Fakery.FakeObject.prototype.resetHistory = function(propagate){
    this._f_read = {};
    this._f_write = {};
    if(propagate){
        for(var i = this._f_innermethods.length; i-->0;){
            this._f_innermethods[i].resetHistory(propagate);
        }
    }
};
/**
 * Define getters and setters on the Fake object to keep track of and gateway access.
 * Can optionall force an access mode (Fakery.mode) on this particular set of getter/setter
 * @param {String} propertyName
 * @param {number} forceMode A Fakery.MODES for this particular set of getter/setter
 */
Fakery.FakeObject.prototype.defineGettersSetters = function defineGettersSetters(propertyName, forceMode){
    this.__defineGetter__(propertyName,function(){
        this._f_read[propertyName] = (this._f_read[propertyName] | 0) + 1;
        //if this is actually a method, return the method
        if(this._f_innermethods[propertyName]){
            return this._f_innermethods[propertyName].get();
        }

        var mode = forceMode || this.mode() || Fakery.mode;
        if(mode == Fakery.MODES.MASK || mode == Fakery.MODES.HOLLOW){
            var entry = this.hasAction(propertyName);
            if(entry && typeof entry.callback == "function") return entry.callback(this,[propertyName]);
            if(mode == Fakery.MODES.HOLLOW) return null;
        }
        return this._f_o[propertyName];
    });
    this.__defineSetter__(propertyName,function(value){
        this._f_write[propertyName] = (this._f_write[propertyName] | 0) + 1;
        //if this is actually a method, reset or remove the method
        if(this._f_innermethods[propertyName]){
            //remove old method
            var i = this._f_innermethods.indexOf(this._f_innermethods[propertyName]);
            i+1 && this._f_innermethods.splice(i);
            this._f_innermethods[propertyName] = null;

            if(value instanceof Fakery.Function)
                value = value.fake;
            if(value instanceof Fakery.FakeMethod){
                //add the replacement method
                this._f_innermethods.push(this._f_innermethods[propertyName] = value);
                return value.get();
            }
            //the value parameter is not a replacement FakeMethod, so should follow the normal rules below;
        }

        var mode = forceMode || this.mode() || Fakery.mode;
        if(mode == Fakery.MODES.MASK || mode == Fakery.MODES.HOLLOW){
            var entry = this.hasAction(propertyName);
            if(entry && typeof entry.callback == "function") return this._f_o[propertyName] = entry.callback(this,[propertyName,value]);
            if(mode == Fakery.MODES.HOLLOW) return null;
        }
        return this._f_o[propertyName] = value;
    });
};
/**
 *
 * @returns {Fakery.State}
 */
Fakery.FakeObject.prototype.state = function(){
    var state = new Fakery.State();
    state.addToState(this._f_read,"reads");
    state.addToState(this._f_write,"writes");
    for(var i = this._f_innermethods.length; i-->0;){
        state.addToState(this._f_innermethods,"methods");
    }
    return state;
}

FakeObject = Fakery.FakeObject;
FakeObject.__proto__ = Fakery.Fake;


/**
 * Creates a proxy Fake object for the originalFunction. Reports on the parentFakeryObject if specified.
 * Does not handle the case where extra properties exist on the Function.
 *
 * @param {Function} originalFunction The method that this Fake is replacing
 * @param {Object=} originalThis The object to force to be the "this" object in the originalFunction when called.
 * @param {Fakery.FakeObject=} parentFakeryObject If this Fake method belongs to a Fake Object, store here.
 * @param {String=} propertyName The property name on that parent Object of this method.
 * @constructor
 * @implements {Fakery.Fake}
 * @throws {Error} When "originalFunction" parameter is missing or is not a function.
 */
Fakery.FakeMethod = function FakeMethod(originalFunction, originalThis, parentFakeryObject, propertyName){
    //Argument check
    if(typeof originalFunction != "function" || originalFunction instanceof Fakery.Function)
        throw new Error("incorrect type or missing required arguments for new instance");
    if( originalThis!=null && typeof originalThis !="object" ||
        parentFakeryObject!=null && !Fakery.FakeObject.instanceOf(parentFakeryObject) ||
        propertyName!=null && typeof propertyName != "string")
        throw new Error("incorrect argument types");

    this.history = [];
    /** @type {Function} */
    this._f_o = originalFunction;
    this._f_t = originalThis;
    this.name = propertyName || originalFunction.name;
    this.length = originalFunction.length;
    /**
     * The replacement function.
     * @type {Fakery.Function}
     * @private
     */
    this._f_new = null;
    /**
     * Repository of Fakery.on calls for this FakeMethod.
     * @type {Array}
     * @private
     */
    this._f_actions = [];
    /** @type {number} */
    this._f_mode = 0;
};
Fakery.FakeMethod.prototype.original = function(){
    return this._f_o;
};
Fakery.FakeMethod.prototype.hasAction = function(args){
    if(args instanceof Array || args === null){
        for(var i= this._f_actions.length; i-->0;) {
            var entry = this._f_actions[i];
            if(Fakery.util_eq(entry.args,args)){
                return entry;
            }
        }
    }
    return null;
};
Fakery.FakeMethod.prototype.onArgsDo = function(args, doThis){
    if(typeof doThis != "function" || (doThis.length!=null && doThis.length!=2)) throw new Error("missing callback or callback is of incorrect type");
    var entry = this.hasAction(args);
    if(entry){
        entry.callback = doThis;
    }else{
        this._f_actions.push({args:args,callback:doThis});
    }
};
Fakery.FakeMethod.prototype.numberOfCalls = function(args){
    if(args instanceof Array){
        var count = 0;
        for(var i= this.history.length; i-->0;) {
            if(Fakery.util_eq(this.history[i],args)){
                count++;
            }
        }
        return count;
    }
    if(args) throw new Error("invalid argument: "+args);
    return this.history.length;
};
Fakery.FakeMethod.prototype.mode = function(mode){
    if(mode==null) return this._f_mode || 0;
    if(mode < 4)
        this._f_mode = mode;
};
Fakery.FakeMethod.prototype.resetHistory = function(propagate){
    this.history = [];
};

/**
 * Creates and returns the replacement function which wraps in scope all the actions needed when it's called.
 * Will forward request and response to/from the Fake object original object.
 * @returns {Fakery.Function}
 */
Fakery.FakeMethod.prototype.get = function(){
    if(this._f_new) return this._f_new;
    var me = this;
    var fxn = function(){
        var args = [].slice.call(arguments)
        me.history.push(args);
        var aer, all_entry = me.hasAction(null);
        if(all_entry && all_entry.callback instanceof Function){
            aer = all_entry.callback(me, args);
        }

        var mode = me.mode() || Fakery.FakeObject.instanceOf(this) && this.mode() ||
            me._f_t instanceof Fakery.FakeObject && me._f_t.mode() || Fakery.mode;
        if(mode != Fakery.MODES.FULL){
            var entry = me.hasAction(args);
            if(entry && entry.callback instanceof Function)
                return entry.callback(me, args);
            if(mode != Fakery.MODES.MASK) return aer || null;
        }
        return me._f_o.apply(me._f_t || this, args);
    };
    fxn.__proto__ = Fakery.Function.prototype;
    fxn.fake = this;
    return this._f_new = fxn;
};
/**
 * Gets the current call state, basically, just it's history.
 * @returns {Fakery.State}
 */
Fakery.FakeMethod.prototype.state = function(){
    var state = new Fakery.State();
    state.addToState(this.history,"history");
    return state;
};

FakeMethod = Fakery.FakeMethod;
FakeMethod.__proto__ = Fakery.Fake;

/** @interface */
Fakery.Function = function(){};
Fakery.Function.prototype.__proto__ = Function.prototype;
/** @type {Fakery.FakeMethod} */
Fakery.Function.prototype.fake = null;
Fakery.Function.prototype.onArgsDo = function(args, doThis){
    //forward to FakeMethod
    return this.fake.onArgsDo(args,doThis);
};
Fakery.Function.prototype.numberOfCalls = function(args){
    //forward to FakeMethod
    return this.fake.numberOfCalls(args);
};
Fakery.Function.prototype.mode = function(mode){
    //forward to FakeMethod
    return this.fake.mode(mode);
};
Fakery.Function.prototype.resetHistory = function(propagate){
    //forward to FakeMethod
    return this.fake.resetHistory(propagate);
};


/* Internal utility for equality comparison, specifically for use comparing arguments. */
Fakery.util_eq = function util_eq(a,b){
    if(a === b) return true;
    if(null==a || null==b || typeof a != typeof b || typeof a != "object") return false;

    if(a.length && a.length != b.length ) return false;
    var done = {};
    for(var g in a){
        if(! util_eq(a[g], b[g])){
            return false;
        }
        done[g] = true;
    }
    for(var g in b){
        if(! done[g]){
            return false;
        }
    }
    return true;
};

if(typeof define != "undefined") define("Fakery", function(){return Fakery;});
else if(typeof exports != "undefined") exports.Fakery = Fakery;