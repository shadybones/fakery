Catchy = new (function Catchy(){})();
Catchy.then = function then( dothis ){
    return (this instanceof CaughtFunction? this : CaughtFunction(this)).then( dothis );
};
Catchy.catchIt = function catchIt( withthis ){
    return (this instanceof CaughtFunction? this : CaughtFunction(this)).catchIt( withthis );
};
Catchy.override = function override( withthis ){
    return (this instanceof CaughtFunction? this : CaughtFunction(this)).override( withthis );
};

function CaughtFunction(original){
    if(!(original instanceof Function)) throw new Error("invalid argument");
    /** @type {CaughtFunction} */
    var me = function(){
        var args = [].splice.apply(arguments);
        if(me.__before__ instanceof Array){
            for(var i = 0; i < me.__before__.length; i++){
                try{
                    me.__before__[i] instanceof Function && me.__before__[i].apply(this,args);
                }catch(e){
                    try{
                        me.__catcher__ instanceof Function && me.__catcher__.apply(this,[e,me.__before__[i],args]);
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
                            me.__catcher__ instanceof Function && me.__catcher__.apply(this,[e,me.__after__[i],args]);
                        }catch(f){}
                    }
                }
            }
        }catch (e){
            try{
                me.__catcher__ instanceof Function && me.__catcher__.apply(this,[e,torun,args]);
            }catch(f){}
        }
        return result;
    };
    me.__proto__ = CaughtFunction.prototype;
    me.__original__ = original;
    return me;
};
CaughtFunction.prototype.then = function cf_then( dothis ){
    if(!(dothis instanceof Function)) throw new Error("invalid argument");
    (this.__after__ = (this.__after__ || [])).push( dothis );
    return this;
};
CaughtFunction.prototype.catchIt = function cf_catchIt( withthis ){
    if(!(withthis instanceof Function)) throw new Error("invalid argument");
    this.__catcher__ = withthis;
    return this;
};
CaughtFunction.prototype.override = function cf_override( withthis ){
    if(!(withthis instanceof Function)) throw new Error("invalid argument");
    this.__override__ = withthis;
    return this;
};
CaughtFunction.prototype.first = function cf_override( dothis ){
    if(!(dothis instanceof Function)) throw new Error("invalid argument");
    (this.__before__ = (this.__before__ || [])).push( dothis );
    return this;
};
/** @type {Function} */
CaughtFunction.prototype.__original__;
/** @type {Function} */
CaughtFunction.prototype.__override__;
/** @type {Function} */
CaughtFunction.prototype.__catcher__;
/** @type {Array<Function>} */
CaughtFunction.prototype.__before__;
/** @type {Array<Function>} */
CaughtFunction.prototype.__after__;

CaughtFunction.prototype.__proto__ = Function.prototype;
Function.prototype.__proto__ = Catchy;

