/**
 *
 * @param a
 * @param object
 * @param callback
 * @returns {*}
 *
 *        START PARAMS                      END PARAM STATE             RETURNS
 * @test {a:1,object:{},callback:null} => {object:{a},callback:[{}]} :  object
 * @test {a:1,object:{},callback:null} => {object:{a},callback:[{}]} :  null
 * @test {a:1,object:{},callback:null} => {object:{a},callback:[{}]} :  undefined
 */
function myFunction(a,object,callback){
    return object;
}




var Testy = {};

Function.prototype.bindArgs = function(list){
    if(list){
        if(this.__original__){
            return this.__original__.bindArgs(list);
        }
        var myfun = this,
            dyna = function(){
                var newArgs = [];
                for(var i = Math.max(list.length,arguments.length); i -->0;){
                    newArgs[i] = list[i]!==undefined ? list[i] : arguments[i];
                }
                return myfun.apply(this,newArgs);
            };
        dyna.__original__ = myfun;
        return dyna;
    }
};

//Returns a replacement function, which calls the original but never returns a value
Function.prototype.mute = function(){
    var me = this,
        dyna = function(){
            me.apply(this,[].slice.call(arguments));
        };
    return Object.defineProperty(dyna, "name", { value: me.name + "_muted" });
};


if(typeof define != "undefined") define("Testy", function(){return Testy;});
else if(typeof exports != "undefined") exports.Testy = Testy;