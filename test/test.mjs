import { share, saveSelf, accessor, abstract, final, define } from "../index.mjs";

describe('CFProtected Library', () => {

  describe('share()', () => {
    const greeting = "Hello!";
    const name = "John Jacob Jingleheimerschmidt";
    const num = 42;
    const methodResult = "It works.";
    const propTestValue = "I can make this return anything!";
    const superTestResult = 1;
    const subTestResult = 2;
    const symbolKey = Symbol('test');
    const symbolValue = 'symbol value';

    class Base {
      static #greeting = greeting;
      static #sprot = share(this, {
        getGreeting: () => this.#greeting,
        superTest: () => 0,
      });

      #propTestVal = propTestValue;
      #prot = share(this, Base, {
        num,
        name,
        method: () => methodResult,
        prop: accessor({
          get: () => this.#propTestVal,
          set: (v) => this.#propTestVal = v
        }),
        superTest: () => superTestResult,
        [symbolKey]: symbolValue
      });

      constructor() {
        saveSelf(this, 'pvt');
      }

      getProt() { return this.#prot; }
      getPropTestVal() { return this.#propTestVal; }
      static getSprot() { return this.#sprot; }
    }

    class Sub extends Base {
      static #sprot = share(this, {
          superTest: () => 1
      });
      static getSprot() { return this.#sprot; } // Add this
      #prot = share(this, Sub, {
        superTest: () => subTestResult,
      });

      constructor() {
        super();
      }

      getProt() { return this.#prot; }
    }

    let baseInst;
    let subInst;

    beforeEach(() => {
      baseInst = new Base();
      subInst = new Sub();
    });

    test('should allow access to basic properties', () => {
      expect(baseInst.getProt().num).toBe(num);
      expect(baseInst.getProt().name).toBe(name);
    });

    test('should allow calling methods', () => {
      expect(baseInst.getProt().method()).toBe(methodResult);
    });

    test('should handle accessor properties (get)', () => {
      expect(baseInst.getProt().prop).toBe(propTestValue);
    });
    
    test('should handle accessor properties (set)', () => {
        const newValue = "new value";
        baseInst.getProt().prop = newValue;
        expect(baseInst.getPropTestVal()).toBe(newValue);
    });

    test('should handle symbol properties', () => {
      expect(baseInst.getProt()[symbolKey]).toBe(symbolValue);
    });

    test('should handle inheritance correctly', () => {
      const subProt = subInst.getProt();
      expect(subProt.num).toBe(num);
      expect(subProt.name).toBe(name);
      expect(subProt.method()).toBe(methodResult);
    });

    test('should handle overriding properties', () => {
      expect(baseInst.getProt().superTest()).toBe(superTestResult);
      expect(subInst.getProt().superTest()).toBe(subTestResult);
    });

    test('should provide access to superclass implementations via $uper', () => {
      const subProt = subInst.getProt();
      expect(subProt.$uper.superTest()).toBe(superTestResult);
    });
    
    test('should handle static property sharing', () => {
        expect(Base.getSprot().getGreeting()).toBe(greeting);
    });
    
    test('should handle static property inheritance and $uper', () => {
        expect(Sub.getSprot().$uper.superTest()).toBe(0);
        expect(Sub.getSprot().superTest()).toBe(1);
    });

    test('should throw TypeError for invalid arguments', () => {
      expect(() => share(null, Base, {})).toThrow(TypeError);
      expect(() => share({}, null, {})).toThrow(TypeError);
      expect(() => share({}, Base, null)).toThrow(TypeError);
    });
    
    test('should work with share(klass, members) overload', () => {
        class A {
            static #shared = share(this, { val: 1 });
            static getShared() { return this.#shared; }
        }
        expect(A.getShared().val).toBe(1);
    });
  });

  describe('saveSelf()', () => {
    test('should bind the instance to a property', () => {
      class Test {
        constructor() {
          saveSelf(this, 'myself');
        }
      }
      const inst = new Test();
      expect(inst.myself).toBe(inst);
    });

    test('should add "cla$$" property to prototype when saving constructor', () => {
      class Test {
        static {
          saveSelf(this, 'pvt');
        }
      }
      const inst = new Test();
      expect(Test.pvt).toBe(Test);
      expect(inst.cla$$).toBe(Test);
    });
  });

  describe('accessor()', () => {
    test('should return a descriptor for a valid getter/setter object', () => {
      const desc = { get: () => 'foo', set: () => {} };
      const acc = accessor(desc);
      expect(typeof acc).toBe('object');
      expect('get' in acc).toBe(true);
      expect('set' in acc).toBe(true);
      expect(Object.getOwnPropertySymbols(acc).length).toBe(1); // The ACCESSOR symbol
    });

    test('should return undefined for invalid input', () => {
      expect(accessor({})).toBeUndefined();
      expect(accessor({ foo: 'bar' })).toBeUndefined();
      expect(accessor(123)).toBeUndefined();
    });
  });

  describe('abstract()', () => {
    const A = abstract(class A {});
    class B extends A {}

    test('should throw when directly instantiating an abstract class', () => {
      expect(() => new A()).toThrow(TypeError);
      expect(() => new A()).toThrow("Class constructor A is abstract and cannot be directly invoked with 'new'");
    });

    test('should not throw when instantiating a derived class', () => {
      expect(() => new B()).not.toThrow();
    });

    test('should create a function that throws when given a string', () => {
        const abstractFn = abstract('myFunc');
        expect(typeof abstractFn).toBe('function');
        expect(() => abstractFn()).toThrow(TypeError);
        expect(() => abstractFn()).toThrow('myFunc() must be overridden');
    });

    test('should throw a TypeError for invalid input', () => {
        expect(() => abstract(123)).toThrow(TypeError);
        expect(() => abstract(123)).toThrow('abstract parameter must be a function or string');
    });
    
    test('should handle classes without names', () => {
        const NoName = abstract(class {});
        expect(() => new NoName()).toThrow("Class constructor  is abstract and cannot be directly invoked with 'new'");
    });
  });

  describe('final()', () => {
    const F = final(class F {});
    
    test('should allow direct instantiation', () => {
        expect(() => new F()).not.toThrow();
    });

    test('should throw when trying to extend a final class', () => {
      // The error happens at class definition time
      expect(() => {
        class D extends F {}
      }).toThrow(TypeError);
    });
    
    test('should throw when trying to create an instance of a descendant', () => {
        // This simulates a bypass of the extension block
        function cheat() {
            const D = function() {};
            Object.setPrototypeOf(D, F);
            Reflect.construct(F, [], D);
        }
        expect(cheat).toThrow("Cannot create an instance of a descendant of a final class");
    });

    test('prototype property should be undefined', () => {
        expect(F.prototype).toBeUndefined();
    });
  });
  
  describe('define()', () => {
    class MyClass {}

    define(MyClass, {
      prop1: { value: 10 },
      prop2: { 
        get: function() { return 20; },
        enumerable: false
      },
      prop3: {
        value: () => 30,
        writable: false,
      }
    });

    const inst = new MyClass();

    test('should define properties on the class prototype', () => {
      expect(MyClass.prototype.hasOwnProperty('prop1')).toBe(true);
      expect(inst.prop1).toBe(10);
    });

    test('should set default attributes (enumerable, configurable, writable)', () => {
      const desc1 = Object.getOwnPropertyDescriptor(MyClass.prototype, 'prop1');
      expect(desc1.enumerable).toBe(true);
      expect(desc1.configurable).toBe(true);
      expect(desc1.writable).toBe(true);
    });

    test('should respect specified attributes', () => {
      const desc2 = Object.getOwnPropertyDescriptor(MyClass.prototype, 'prop2');
      expect(desc2.enumerable).toBe(false); // Overridden
      expect(desc2.configurable).toBe(true); // Defaulted
      expect(desc2.writable).toBeUndefined(); // Not a value property
    });
    
    test('should not default writable if value is not present', () => {
        const desc = Object.getOwnPropertyDescriptor(MyClass.prototype, 'prop2');
        expect('writable' in desc).toBe(false);
    });
    
    test('should respect specified writable attribute', () => {
      const desc3 = Object.getOwnPropertyDescriptor(MyClass.prototype, 'prop3');
      expect(desc3.writable).toBe(false);
    });

    test('should throw TypeError for invalid arguments', () => {
      expect(() => define(null, {})).toThrow(TypeError);
      expect(() => define(MyClass, null)).toThrow(TypeError);
    });
  });
});
