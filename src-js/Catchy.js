Catchy = new (function Catchy(){})();

/** @typedef {function(Error,CaughtFunction,function,Array)} */
Catchy.Catcher;
/** @typedef {function} A callback which is passed the same args as the original's call, and uses the same "this" object. */
Catchy.Callback;
/** @type {function} */
Catchy.defaultCatcher;

(function(){
    /** @param {!function} original */
    function CaughtFunction(original){
        if(!(this == window || this.window)) throw new Error("no access as constructor. do not instantiate using 'new'.");
        if(!(original instanceof Function)) throw new Error("invalid argument");
        if(original instanceof CaughtFunction) return original;

        /** @type {CaughtFunction} */
        var me = function(){
            var args = [].splice.apply(arguments);
            if(me.__before__ instanceof Array){
                for(var i = 0; i < me.__before__.length; i++){
                    try{
                        me.__before__[i] instanceof Function && me.__before__[i].apply(this,args);
                    }catch(e){
                        try{
                            me.__catcher__ instanceof Function && me.__catcher__.apply(this,[e,me,me.__before__[i],args]);
                        }catch(f){}
                    }
                }
            }
            var result, torun = me.__override__ instanceof Function && me.__override__ || original;
            try {
                result = torun.apply(this, args);
                args.push(result);
                if (me.__after__ instanceof Array) {
                    for (var i = 0; i < me.__after__.length; i++) {
                        try {
                            me.__after__[i] instanceof Function && me.__after__[i].apply(this, args);
                        } catch (e) {
                            try{
                                me.__catcher__ instanceof Function && me.__catcher__.apply(this,[e,me,me.__after__[i],args]);
                            }catch(f){}
                        }
                    }
                }
            }catch (e){
                try{
                    me.__catcher__ instanceof Function && me.__catcher__.apply(this,[e,me,torun,args]);
                }catch(f){}
            }
            return result;
        };
        me.__proto__ = CaughtFunction.prototype;
        me.__original__ = original;

        if(original.name) {
            if(window[original.name] === original){
                window[original.name] = me;
            }
            if(self[original.name] === original){
                self[original.name] = me;
            }
        }

        return me;
    }

    CaughtFunction.prototype.then = function cf_then( dothis , onError){
        if(!(dothis instanceof Function)) throw new Error("invalid argument");
        (this.__after__ = (this.__after__ || [])).push( dothis );

        if(onError) this.catch(onError);

        return this;
    };
    CaughtFunction.prototype.catch = function cf_catch( withthis ){
        if(!(withthis instanceof Function)) throw new Error("invalid argument");
        this.__catcher__ = withthis;
        return this;
    };
    CaughtFunction.prototype.override = function cf_override( withthis ){
        if(!(withthis instanceof Function) && withthis !== undefined) throw new Error("invalid argument");
        this.__override__ = withthis;
        return this;
    };
    CaughtFunction.prototype.first = function cf_first( dothis ){
        if(!(dothis instanceof Function)) throw new Error("invalid argument");
        (this.__before__ = (this.__before__ || [])).push( dothis );
        return this;
    };
    CaughtFunction.prototype.toString = function toString(){
        return "CaughtFunction {" +
            (this.__catcher__ ? "hasCatcher, " : "" ) +
            (this.__override__ ? "hasOverride, " : "" ) +
            (this.__before__ ? "runBefore:"+this.__before__.length+", " : "" ) +
            (this.__after__ ? "runAfter:"+this.__after__.length+", " : "" ) +
            (this.__original__ ? (this.__original__.name ? this.__original__.name : "hasOriginal") : "" ) +
            "}";
    };

    //Declarations for IDE, but not accurate.
    /** @type {Function} */
    CaughtFunction.prototype.__original__;
    /** @type {Catchy.Callback} */
    CaughtFunction.prototype.__override__;
    /** @type {Catchy.Catcher} */
    CaughtFunction.prototype.__catcher__;
    /** @type {Array<Catchy.Callback>} */
    CaughtFunction.prototype.__before__;
    /** @type {Array<Catchy.Callback>} */
    CaughtFunction.prototype.__after__;

    CaughtFunction.prototype.__proto__ = Function.prototype;

    /** @param {!Catchy.Callback} dothis */
    Catchy.then = function then( dothis ){
        return CaughtFunction(this).then( dothis );
    };
    /** @param {!Catchy.Catcher} withthis */
    Catchy.catch = function catchIt( withthis ){
        return CaughtFunction(this).catch( withthis || Catchy.defaultCatcher );
    };
    /** @param {!Catchy.Callback} withthis */
    Catchy.override = function override( withthis ){
        return CaughtFunction(this).override( withthis );
    };
    /** @param {!Catchy.Callback} dothis */
    Catchy.first = function first( dothis ){
        return CaughtFunction(this).first( dothis );
    };
    /** @return {Promise} **/
    Catchy.promisify = function promisify( bind ){
        var me = this;
        return function(){
            var error = null;
            try{
                result = me.apply(bind || this, arguments);
            }catch(e){
                error = e;
            }
            if(typeof Promise != "undefined" && Promise instanceof Function && 0){
                return new Promise(function(resolve, reject){ if (error) reject(error); else resolve(result); });
            }else if(typeof $ != "undefined" && $ instanceof Function && $.Deferred instanceof Function && 0){
                var def = $.Deferred(),
                    prom = def.promise();
                if(error){
                    def.reject(error);
                }else def.resolve(result);
                prom.finally = prom.always;
                prom.catch = prom.fail;
                return prom;
            }else{
                prom = {
                    then: function ( s, f){
                        if(error) f(error);
                        else{
                            try{
                                s(result);
                            }catch( e ){
                                f && f instanceof Function && f(error = e);
                            }
                        }
                        return prom;
                    },
                    catch : function (f) {
                        if(error && f && f instanceof Function) f(error);
                        return prom;
                    },
                    finally : function (f) {
                        f && f instanceof Function && f();
                        return prom;
                    }
                };
                return prom;
            }
        }
    };

})();
Function.prototype.__proto__ = Catchy;

if(typeof define != "undefined") define("Catchy", function(){return Catchy;});
else if(typeof exports != "undefined") exports.Catchy = Catchy;
