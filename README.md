# CFProtected
This project provides a simple and straight forward means of sharing private
fields between classes, providing a facility similar to protected members in
other languages. This project also provides a few other convenience functions
to work around some the issues inherent in using private fields.

## How to use
Let's just start with a simple example:

```js
import { share, accessor } from "cfprotected";

class Example {
    //shared static private fields
    static #shared = share(this, {
        //Data fields
        theAnswer: 42,
        //Methods
        callMe: () => {
            console.log("Arrow notation simplifies things.");
        },
        //Accessor properties
        prop: accessor({
            get: () => { return "An ordinary getter."; },
            set: (v) => { /* set something here */ }
        })
    });

    //shared instance private fields
    #shared = share(this, Example, {
        data: "HHGTTG",
        method: () => { /* do whatever */ },
        readOnly: accessor({
            get: () => { return "Nothing to see here!" }
        })
    });

    whatIsTheAnswer() {
        return this.#shared.theAnswer;
    }
}

class Derived extends Example {
    static #shared = share(this, {});

    #shared = share(this, Derived, {});

    test() {
        console.log(`the Answer is ${this.cla$$.#shared.theAnswer}`);
        console.log(`Why use arrow notation?`);
        this.#shared.callMe();
        this.#shared.theAnswer /= 2;
        console.log(`What is the answer? ${this.whatIsTheAnswer()}`);
    }
}
```

There are 5 API functions:

* share
* accessor
* saveSelf
* abstract
* final

The first provides the actual sharing feature. The next 2 provide for work arounds to issues related to this sharing feature as well as Proxy support. The last 2 are just helper functions providing the corresponding limitation to the class.

## **share(instance, class?, memberObject)**
This function does all the leg work in setting up sharing between a given class and those derived from it. It follows the following general steps.

1. Verify the parameters.
2. Find any shared member left for the instance.
3. Create/modify the protected data structure.
4. Construct and store the shared member record.
5. Create a class specific accessor object and return it.

The object returned by this function contains an accessor for each of the properties described in the `memberObject` as well as accessors for each of the members that were listed in the shared member record. Any members re-defined on the derived class shadow the same member from the base class **<sup>+</sup>**. As a result, functions of the base class that access this member when used from an instance of the derived class will access the derived class version of that member.

### Notes:
**+** There is 1 caveat when it comes to shadowing base members. Accessors need to be handled specially. If an accessor is defined directly in `memberObject`, it cannot be properly shadowed. The methods of each class will only be able to access the version  of the member defined in that class. To ensure accessors can properly be shadowed across the entire inheritance chain, use the following API function.

## **accessor(descriptor)**
The property descriptor passed to this function is a limited version of the standard ES property descriptor object, only allowing `get` and `set` members. All other members of this object are ignored. A new property descriptor is created and tagged so that the `share` function will use it as the accessor descriptor for the corresponding property in the accessor object. It is this relocation that allows for proper shadowing of shared accessors. 

### Notes:
There is a secondary purpose for this `accessor` method. The biggest "gotcha" related to this approach to sharing members is that the members are all owned by an object other than `this`. At the same time, if the member is a function or accessor, it needs to be bound to `this`. Only runtime assignment can guarantee this, so creating such methods as field initializers is the only simple way to do it without resorting to the constructor.

## **saveSelf(self, name)**
This method provides a means to work around the issue that comes along with using private fields together with Proxy. Since Proxy does not pass through access to private fields without a full membrane setup, the most straight forward solution is to provide a "self" property on the instance. This function is a convenience function that allows you to create and name that property. Use this function in the static block and/or constructor.
```js
class Example {
    static {
        saveSelf(this, "shared");
    }

    constructor() {
        saveSelf(this, "shared");
    }

    ...
}
```

As a bonus, when used on the constructor, it creates an additional property named "cla\$\$" on the prototype. This "cla\$\$" property gives instances a means to reference the class constructor even when the class itself is anonymous. This is a fill-in feature for one of the TC39 proposals offering syntax for the same.

## **abstract(klass)**
This method is a class wrapper that prevents instances of the class from being constructed directly. To construct an instance of the class you must extend it. This should be nearly identical to the same functionality that exists in some compiled languages.
```js
const Example = abstract(class {
    ...
});
```

## **final(klass)**
This method is a class wrapper that prevents instances of the class from being created using descendant classes. It also attempts to prevent creation of descendant classes.
```js
const Example = final(class {
    ...
});
```

## Other features
There will be occasions when a shared function that shadows an ancestor function needs to call the ancestor's function. Unfortunately, `super` cannot give you access to these. There is a similar problem when accessing accessors and data properties. To satisfy this need, the class-specific accessor option is given an additional property: `$uper`. Using this property, it is possible to reach the ancestor version of any shared member.

```js
class A {
    #shared = share(this, A, {
        doSomething: () => { console.log(`Called A::doSomething`); }
    });

    ...
}

class B extends A {
    #shared = share(this, B, {
        doSomething: () => {
            console.log(`Called B::doSomething`);
            this.#shared.$uper.doSomething();
        }
    });

    test() {
        this.#shared.doSomething();
    }
}
```
