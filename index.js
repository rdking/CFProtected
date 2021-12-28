const memos = new WeakMap();
const ACCESSOR = Symbol();

function getAllOwnKeys(o) {
    return Object.getOwnPropertyNames(o)
        .concat(Object.getOwnPropertySymbols(o));
}

/**
 * Used to both store inherited property information as well as retrieve it.
 * @param {Object} inst The instance object that will own the shared members.
 * @param {Function?} klass The constructor function of the class sharing
 * members. Optional. If omitted, defaults to inst.
 * @param {Object} members The object containing the properties being shared.
 * @returns {Object} The fully constructed inheritance object.
 */
module.exports.share = function share(inst, klass, members) {
    let retval = {};

    if ((typeof(inst) == "function") 
        && klass && (typeof(klass) == "object")
        && (members === void 0)) {
        members = klass;
        klass = inst;
    }

    if (!inst || !["function", "object"].includes(typeof(inst))) {
        throw new TypeError(`Expected inst to be a function or an object.`);
    }
    if (!klass || (typeof(klass) != "function")) {
        throw new TypeError(`Expected klass to be a function.`);
    }
    if (!members || (typeof(members) != "object")) {
        throw new TypeError(`Expected members to be an object.`);
    }

    
    /*
    * Each class' memo entry has the following structure:
    * 
    * inst: {
    *   data: <Object> - the actual protected data object
    *   inheritance: <Object> - the object of accessor properties to share
    *                           with descendant classes.
    * }
    */
   
    //Find the nearest known registered ancestor
    let ancestor = Object.getPrototypeOf(klass);
    while (ancestor && !memos.has(ancestor)) {
        ancestor = Object.getPrototypeOf(ancestor);
    }

    //Get the memo from that ancestor
    let ancestorMemo = memos.get(ancestor) || new WeakMap();

    //Create a memo for the current class
    if (!memos.has(klass)) {
        memos.set(klass, new WeakMap());
    }

    //Get the protected data object.
    let memo = ancestorMemo.get(inst) || {data: {}, $uper: {}, inheritance: null};
    let protData = memo.data;
    
    //Get the details of the protected properties.
    let mDesc = Object.getOwnPropertyDescriptors(members);
    let mKeys = getAllOwnKeys(members);

    //Change the prototype of protoData using the new members.
    let prototype = Object.getPrototypeOf(protData);
    let proto = Object.create(prototype,
        Object.fromEntries(mKeys
            .filter(k => !mDesc[k].value?.hasOwnProperty(ACCESSOR))
            .map(k => [k, mDesc[k]])));
    Object.setPrototypeOf(protData, proto);

    //Build the accessors for this class.
    mKeys.forEach(m => {
        let desc = (mDesc[m].value?.hasOwnProperty(ACCESSOR))
            ? {
                enumerable: true,
                get: mDesc[m].value.get,
                set: mDesc[m].value.set
            }
            : mDesc[m];
        
        Object.defineProperty(retval, m, desc);
    });
    
    //Define the "super" accessors
    Object.defineProperty(retval, "$uper", { value: {} });

    for (let key of mKeys) {
        if (key in prototype) {
            let obj = prototype;
            while (!obj.hasOwnProperty(key)) {
                obj = Object.getPrototypeOf(obj);
            }
            Object.defineProperty(retval.$uper, key, Object.getOwnPropertyDescriptor(obj, key));
        }
    }

    //Attach the super inheritance
    Object.setPrototypeOf(retval.$uper, memo.$uper);

    //Inherit the inheritance
    Object.setPrototypeOf(retval, memo.inheritance);

    //Save the inheritance & protected data
    memos.get(klass).set(inst, {
        data: protData,
        inheritance: retval,
        $uper: retval.$uper
    });    

    return retval;
}

/**
 * Binds the class instance to itself to allow code to selectively avoid Proxy
 * issues, especially ones involving private fields. Also binds the class
 * constructor to the instance for static referencing as "cla$$".
 * @param {Object} self The current class instance as seen from the constructor.
 * @param {String} name The name of the field on which to bind the instance.
 */
 module.exports.saveSelf = function(self, name) {
    Object.defineProperty(self, name, {value: self});
    if (typeof(self) == "function") {
        Object.defineProperty(self.prototype, "cla$$", {value: self});
    }
}

/**
 * Marks the property as a shared, overrideable accessor and defines the 
 * getter and setter methods for it.
 * @param {Object} desc Object containing get and/or set definitions for the
 * accessor.
 * @returns {Object} A tagged object that will be used to create the access
 * bindings for the property.
 */
module.exports.accessor = function(desc) {
    if ((typeof(desc) == "object") &&
        (("get" in desc) || ("set" in desc))) {
        return {
            [ACCESSOR]: undefined,
            get: desc.get,
            set: desc.set
        }
    }
}

/**
 * A class wrapper that blocks construction of an instance if the class being
 * instantiated is not a descendant of the current class.
 * @param {Function} klass The constructor of the current class.
 */
module.exports.abstract = function(klass) {
    return new Proxy(klass, {
        construct(target, args, newTarget) {
            if (newTarget.prototype === klass.prototype)
                throw new TypeError(`Cannot construct instance of abstract class.`);

            return Reflect.construct(target, args, newTarget);
        }
    });
};

/**
 * A class wrapper that blocks construction of an instance if the class being
 * constructed is a descendant of the current class.
 * @param {Function} klass The constructor of the current class.
 */
module.exports.final = function(klass) {
    return new Proxy(klass, {
        construct(target, args, newTarget) {
            if (newTarget.prototype !== klass.prototype)
                throw new TypeError(`Cannot extend final class.`);

            return Reflect.construct(target, args, newTarget);
        }
    });
};
