import { TestWatcher } from "@jest/core";
import { share, saveSelf, accessor } from "../index"; //require("cfprotected");

class Base {
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
            console.log(`Called Base::superTest() ...`);
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
    #prot = share(this, GrandChild, {
        otherMethod: () => {
            this.#prot.name = this.testName;
        },
        superTest: () => {
            console.log(`Called GrandChild::superTest() ...`);
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
    #prot = share(this, SuperTest, {
        superTest: () => {
            console.log(`Called SuperTest::superTest() ...`);
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
})