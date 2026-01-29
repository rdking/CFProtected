"use strict"

const memos = new WeakMap();
const ACCESSOR = Symbol();

/**
 * General definition of a class constructor function.
 * @typedef Constructor
 * @type new (...args: any[]) => object
 */


/**
 * Returns all public keys of the specified object.
 * @param {object} o
 * @returns {(string|symbol)[]}
 */
function getAllOwnKeys(o) {
    /** @type {(string|symbol)[]} */
    let retval = Object.getOwnPropertyNames(o);
    return retval.concat(Object.getOwnPropertySymbols(o));
}

/**
 * @typedef Descriptor
 * @property {*} [value]
 * @property {Function} [get]
 * @property {Function} [set]
 * 
 * Calls the given function against each descriptor property that itself is
 * also a function.
 * @param {Descriptor} desc 
 * @param {Function} fn 
 */
function useDescriptor(desc, fn) {
    if ("value" in desc) {
        if (typeof(desc.value) == "function") {
            fn("value");
        }
    }
    else {
        if (typeof(desc.get) == "function") {
            fn("get");
        }
        if (typeof(desc.set) == "function") {
            fn("set");
        }
    }
}

/**
 * Binds all functions of the descriptor to the given context object.
 * @param {Descriptor} desc 
 * @param {object} context 
 */
function bindDescriptor(desc, context) {
    useDescriptor(desc, (key) => {
        desc[key] = desc[key].bind(context);
    });
}

/**
 * Used to both store inherited property information as well as retrieve it.
 * @overload { (inst, klass, members) => object }
 * @overload { (inst, members) => object }
 * @param {object} inst The instance object that will own the shared members.
 * @param {Constructor|object} klass The constructor function of the class sharing
 * members. Optional. If omitted, defaults to inst.
 * @param {object=} members The object containing the properties being shared.
 * @returns {object} The fully constructed inheritance object.
 */
function share(inst, klass, members) {
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
   
    //Find the nearest known registered ancestor class
    let ancestor = Object.getPrototypeOf(klass);
    while (ancestor && !memos.has(ancestor)) {
        ancestor = Object.getPrototypeOf(ancestor);
    }

    //Get the memo from that ancestor
    let ancestorMemo = memos.get(ancestor) || new WeakMap();

    //Create a memo map for the current class
    if (!memos.has(klass)) {
        memos.set(klass, new WeakMap());
    }

    //Get the protected data object.
    let ancestorKey = (inst === klass) ? ancestor : inst;
    let memo = ancestorMemo.get(ancestorKey) || {data: {}, $uper: {}, inheritance: null};
    let protData = memo.data;
    
    //Get the details of the protected properties.
    let mDesc = Object.getOwnPropertyDescriptors(members);
    let mKeys = getAllOwnKeys(members);

    //Add the new members to the prototype chain of protData.
    let prototype = Object.getPrototypeOf(protData);
    
    let proto = Object.create(prototype,
        Object.fromEntries(mKeys
            .map(k => {
                // @ts-ignore
                let desc = mDesc[k];
                if (desc.value?.hasOwnProperty(ACCESSOR)) {
                    Object.assign(desc, desc.value);
                    desc.enumerable = true;
                    delete desc[ACCESSOR];
                    delete desc.value;
                    delete desc.writable;
                }
                bindDescriptor(desc, inst);
                return [k, desc];
            })));
    Object.setPrototypeOf(protData, proto);

    //Build the accessors for this class.
    mKeys.forEach(m => {
        Object.defineProperty(retval, m, {
            get() { return protData[m]; },
            set(v) { protData[m] = v; }
        });
    });
    
    //Define the "$uper" accessors
    Object.defineProperty(retval, "$uper", { value: {} });

    //Build up the "$uper" object
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
 * @param {object} self The current class instance as seen from the constructor.
 * @param {string} name The name of the field on which to bind the instance.
 */
function saveSelf(self, name) {
    Object.defineProperty(self, name, {value: self});
    if ((typeof(self) == "function") && (typeof(self.prototype) == "object") && !Object.hasOwn(self.prototype, "cla$$")) {
        Object.defineProperty(self.prototype, "cla$$", {value: self.prototype.constructor, configurable: true});
    }
}

/**
 * Marks the property as a shared, overrideable accessor and defines the 
 * getter and setter methods for it.
 * @param {object} desc Object containing get and/or set definitions for the
 * accessor.
 * @returns {object} A tagged object that will be used to create the access
 * bindings for the property.
 */
function accessor(desc) {
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
 * @param {Constructor|string} klass If a function, the constructor of the current
 * class. If a string, the name of the function being abstracted.
 * @returns {Function} Either an extended class that denies direct construction
 * or a function that immediately throws.
 */
function abstract(klass) {
    let retval;
    if (typeof(klass) == "function") {
        let name = klass.name ? klass.name : "";
        retval = class extends klass {
            constructor (...args) {
                if (new.target === retval) {
                    throw new TypeError(`Class constructor ${name} is abstract and cannot be directly invoked with 'new'`);
                }
                super(...args);
            }
        };

        if (memos.has(klass)) {
            let memo = memos.get(klass);
            memos.set(retval, memo);
            memo.set(retval, memo.get(klass));
        }
    }
    else if (typeof(klass) == "string") {
        retval = function() {
            throw new TypeError(`${klass}() must be overridden`);
        }
    }
    else {
        throw new TypeError(`abstract parameter must be a function or string`)
    }
    
    return retval;
};

/**
 * A class wrapper that blocks construction of an instance if the class being
 * constructed is a descendant of the current class. It also attempts to block
 * extending the targeted class.
 * @param {Constructor} klass The constructor of the current class.
 */
function final(klass) {
    /**
     * Replaces the first parameter in the args list with the given class (klass)
     * and calls the original method to bypass 
     * @param {string} fname Name of the ProxyHandler method being called.
     * @param {any[]} args Arguments to the ProxyHandler method
     * @returns {any}
     */
    function handleDefault(fname, args) {
        args.shift();
        args.unshift(klass);
        return Reflect[fname](...args);
    }

    let retval = new Proxy(function() {}, {
        construct(_, args, newTarget) {
            if (newTarget !== retval) {
                throw new TypeError("Cannot create an instance of a descendant of a final class");
            }
            let inst = Reflect.construct(klass, args, newTarget);
            let proto = Object.create(klass.prototype, {
                constructor: {
                    enumerable: true,
                    configurable: true,
                    writable: true,
                    value: retval
                }
            });
            Object.setPrototypeOf(inst, proto);
            return inst;
        },
        get(_, prop, receiver) {
            return (prop == "prototype")
                ? void 0
                : Reflect.get(klass, prop, receiver);
        },
        
        set(...args) { return handleDefault("set", args); },
        apply(...args) { return handleDefault("apply", args); },
        defineProperty(...args) { return handleDefault("defineProperty", args); },
        deleteProperty(...args) { return handleDefault("deleteProperty", args); },
        getOwnPropertyDescriptor(...args) { return handleDefault("getOwnPropertyDescriptor", args); },
        getPrototypeOf(...args) { return handleDefault("getPrototypeOf", args); },
        has(...args) { return handleDefault("has", args); },
        isExtensible(...args) { return handleDefault("isExtensible", args); },
        ownKeys(...args) { return handleDefault("ownKeys", args); },
        preventExtensions(...args) { return handleDefault("preventExtensions", args); },
        setPrototypeOf(...args) { return handleDefault("setPrototypeOf", args); }
    });        

    if (memos.has(klass)) {
        let memo = memos.get(klass);
        memos.set(retval, memo);
        memo.set(retval, memo.get(klass));
    }

    return retval;
};

/**
 * Adds specified definitions to the class prototype. All supplied definitions will
 * default to {enumerable: true, configurable: true, writable: true} unless otherwise
 * specified. The {writable} attribute will not be defaulted if {value} is not specified.
 * This is for providing public class members that are bound to the prototype instead of
 * the instance objects. Use this function in the `static {}` block of the class.
 * @param {function} tgt The constructor function whose prototype will be modified.
 * @param {object} defs The set of property definitions to be applied to the prototype.
 */
function define(tgt, defs) {
    if (typeof(tgt) !== "function") {
        throw new TypeError("Invalid target type in first parameter.");
    }
    if (!defs || (typeof(defs) !== "object")) {
        throw new TypeError("Invalid definition type in second parameter.");
    }
    
    for (let key in defs) {
        let def = defs[key];
        let isDef = Object.getOwnPropertyNames(def).reduce((rv, cv) => {
            return rv && ["enumerable", "configurable", "writable", "value"].includes(cv);
        }, true);

        if (!def || (typeof(def) !== "object") || !isDef || !("value" in def)) {
            continue;
        }
        if (!("enumerable" in def)) {
            def.enumerable = true;
        }
        if (!("configurable" in def)) {
            def.configurable = true;
        }
        if (!("writable" in def)) {
            def.writable = true;
        }
    }
    
    Object.defineProperties(tgt.prototype, defs);
}

module.exports = { share, saveSelf, accessor, abstract, final, define };
