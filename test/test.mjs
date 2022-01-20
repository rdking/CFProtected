import { TestWatcher } from "@jest/core";
import { share, saveSelf, accessor, abstract, final } from "../index"; //require("cfprotected");

class Base {
    static #greeting = "Hello!";
    static #sprot = share(this, {
        getGreeting() { return this.#greeting; }
    });
    #prot = share(this, Base, {
        num: 42,
        name: "John Jacob Jingleheimerschmidt",
        method: () => {
            return "It works.";
        },
        prop: accessor({
            get: () => this.propTestVal
        }),
        superTest: () => {
            return 1;
        }
    });

    constructor() {
        saveSelf(this, "pvt");
    }

    testName = "John Jacob Jingleheimerschmidt";
    propTestVal = "I can make this return anything!";

    checkProp(proxied) {
        expect((proxied?this.pvt:this).#prot.prop).toBe(this.propTestVal);
    }

    run() {
        test(`Access to shared members should just work on the instance`, () => {
            expect(this.#prot.num).toBe(42);
            expect(this.#prot.name).toBe(this.testName);
            expect(this.#prot.method()).toBe("It works.");
            this.checkProp();
        });
        
        test(`Access to shared members should work even through a Proxy`, () => {
            let that = new Proxy(this, {});
            expect(that.pvt.#prot.num).toBe(42);
            expect(that.pvt.#prot.name).toBe(this.testName);
            expect(that.pvt.#prot.method()).toBe("It works.");
            this.checkProp(true);
        });
    }
}

class Derived extends Base {
    #prot = share(this, Derived, {
        otherMethod: () => {
            this.#prot.name = this.testName;
        },
        prop: accessor({
            get: () => this.propTestVal2
        })
    });

    constructor() {
        super();
        saveSelf(this, "pvt");
        this.propTestVal2 = this.propTestVal;
    }

    run() {
        super.run();

        test(`Should be able to change a shared property value`, () => {
            this.testName = "A. Nony Mouse";
            expect(() => { this.#prot.otherMethod(); }).not.toThrow();
            this.checkProp();
        });
    }
}

class NonParticipant extends Base {}

class GrandChild extends NonParticipant {
    static #sprot = share(this, {
        getGreeting() {
            return `${this.#sprot.$uper.getGreeting()} My name is`;
        }
    });
    #prot = share(this, GrandChild, {
        otherMethod: () => {
            this.#prot.name = this.testName;
        },
        superTest: () => {
            return 1 + this.pvt.#prot.$uper.superTest();
        }
    });

    constructor() {
        super();
        saveSelf(this, "pvt");
    }

    run() {
        super.run();

        test(`Should be able to change a shared property value`, () => {
            this.testName = "A. Nony Mouse 1";
            expect(() => { this.#prot.otherMethod(); }).not.toThrow();
            this.checkProp();
        });
    }
}

class SuperTest extends GrandChild {
    static #sprot = share(this, {
        getGreeting() {
            return `${this.#sprot.$uper.getGreeting()} "${this.name}"!`
        }
    });
    #prot = share(this, SuperTest, {
        superTest: () => {
            return 1 + this.pvt.#prot.$uper.superTest();
        }
    });

    constructor() {
        super();
        saveSelf(this, "pvt");
    }

    run() {
        test(`Should be able to call super through the entire inheritance chain`, () => {
            expect(this.pvt.#prot.superTest()).toBe(3);
        });
        test(`Should be able to call super through the entire static inheritance chain`, () => {
            expect(SuperTest.#sprot.getGreeting()).toBe(`Hello! My name is "SuperTest"!`);
        });
    }
}

describe(`Testing shared elements in the base class`, () => {
    (new Base).run();
});
describe(`Testing shared elements in a direct descendant`, () => {
    (new Derived).run();
});

describe(`Testing shared elements inherited from a non-participant`, () => {
    (new GrandChild).run();
});

describe(`Testing that $uper works in all cases`, () => {
    (new SuperTest).run();
});

describe(`Testing that abstract classes function as expected`, () => {
    const key = Symbol();
    const ATest = abstract(class ATest {
        static #sshared = share(this, {
            [key]: true
        });
        #shared = share(this, ATest, {
            [key]: true
        });
    });
    class DTest extends ATest {
        static #sshared = share(this, {});
        #shared = share(this, DTest, {});
        run() { return this.#shared[key]; }
        static run() { return this.#sshared[key]; }
    };

    test(`Should not be able to instantiate directly`, () => {
        expect(() => { new ATest; }).toThrow();
    });
    test(`Should be able to instantiate a derived class`, () => {
        expect(() => { new DTest; }).not.toThrow();
    });
    test(`Should see shared members from constructed instance`, () => {
        expect((new DTest).run()).toBe(true);
    });
    test(`Should see static shared members from constructed instance`, () => {
        expect(DTest.run()).toBe(true);
    });
});

describe(`Testing that final classes function as expected`, () => {
    const key = Symbol();
    class TestBase {
        static #sshared = share(this, {
            [key]: true
        });
        #shared = share(this, TestBase, {
            [key]: true
        });
    }
    const FTest = final(class FTest extends TestBase {
        static { saveSelf(this, "pvt"); }
        static #sshared = share(this, {});
        #shared = share(this, FTest, {});
        run() { return this.#shared[key]; }
        static run() { return this.pvt.#sshared[key]; }
    });

    test(`Should be able to instantiate an instance directly`, () => {
        expect(() => { new FTest; }).not.toThrow();
    });
    test(`Should not be able to extend directly`, () => {
        expect(() => { class DTest extends FTest {}; }).toThrow();
    });
    test(`Should not be able to cheat and create an instance of a derived class`, () => {
        expect(() => {
            FTest.prototype = {};
            class DTest extends FTest {}
            new DTest;
        }).toThrow();
    });
    test(`Should see shared members from constructed instance`, () => {
        expect((new FTest).run()).toBe(true);
    });
    test(`Should see static shared members from constructed instance`, () => {
        expect(FTest.run()).toBe(true);
    });
});