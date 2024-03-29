"use strict"

const memos = new WeakMap();
const ACCESSOR = Symbol();

function getAllOwnKeys(o) {
    return Object.getOwnPropertyNames(o)
        .concat(Object.getOwnPropertySymbols(o));
}

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

function bindDescriptor(desc, context) {
    useDescriptor(desc, (key) => {
        desc[key] = desc[key].bind(context);
    });
}

/**
 * Used to both store inherited property information as well as retrieve it.
 * @param {Object} inst The instance object that will own the shared members.
 * @param {Function?} klass The constructor function of the class sharing
 * members. Optional. If omitted, defaults to inst.
 * @param {Object} members The object containing the properties being shared.
 * @returns {Object} The fully constructed inheritance object.
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
                if (mDesc[k].value?.hasOwnProperty(ACCESSOR)) {
                    Object.assign(mDesc[k], mDesc[k].value);
                    mDesc[k].enumerable = true;
                    delete mDesc[k][ACCESSOR];
                    delete mDesc[k].value;
                    delete mDesc[k].writable;
                }
                bindDescriptor(mDesc[k], inst);
                return [k, mDesc[k]];
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
 * @param {Object} self The current class instance as seen from the constructor.
 * @param {String} name The name of the field on which to bind the instance.
 */
function saveSelf(self, name) {
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
 * @param {function|string} klass If a function, the constructor of the current
 * class. If a string, the name of the function being abstracted.
 * @returns {function} Either an extended class that denies direct construction
 * or a function that immediately throws.
 */
function abstract(klass) {
    let retval;
    if (typeof(klass) == "function") {
        let name = klass.name?klass.name : "";
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
 * @param {Function} klass The constructor of the current class.
 */
function final(klass) {
    let retval = new Proxy(function() {}, {
        handleDefault(fname, args) {
            args.shift();
            args.unshift(klass);
            return Reflect[fname](...args);
        },
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
        set(...args) { return this.handleDefault("set", args); },
        apply(...args) { return this.handleDefault("apply", args); },
        defineProperty(...args) { return this.handleDefault("defineProperty", args); },
        deleteProperty(...args) { return this.handleDefault("deleteProperty", args); },
        getOwnPropertyDescriptor(...args) { return this.handleDefault("getOwnPropertyDescriptor", args); },
        getPrototypeOf(...args) { return this.handleDefault("getPrototypeOf", args); },
        has(...args) { return this.handleDefault("has", args); },
        isExtensible(...args) { return this.handleDefault("isExtensible", args); },
        ownKeys(...args) { return this.handleDefault("ownKeys", args); },
        preventExtensions(...args) { return this.handleDefault("preventExtensions", args); },
        setPrototypeOf(...args) { return this.handleDefault("setPrototypeOf", args); }
    });        

    if (memos.has(klass)) {
        let memo = memos.get(klass);
        memos.set(retval, memo);
        memo.set(retval, memo.get(klass));
    }

    return retval;
};

export { share, saveSelf, accessor, abstract, final };
