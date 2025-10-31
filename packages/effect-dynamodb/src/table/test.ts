// Solution 1: Using a generic type with proper constraints
type DerivedValue<T, Deps extends readonly (keyof T)[]> = {
  value: T;
  deps: Deps;
  derive: (value: Pick<T, Deps[number]>) => string;
};

// Solution 2: Using a more flexible approach with tuple
type DerivedValueAlt<T, K extends keyof T> = {
  value: T;
  deps: K[];
  derive: (value: Pick<T, K>) => string;
};

// Example usage:
interface Person {
  firstName: string;
  lastName: string;
  age: number;
}

// Using Solution 1 (with readonly array for better inference)
const example1: DerivedValue<Person, readonly ['firstName', 'lastName']> = {
  value: { firstName: 'John', lastName: 'Doe', age: 30 },
  deps: ['firstName', 'lastName'] as const,
  derive: (value) => `${value.firstName} ${value.lastName}`, // ✅ TypeScript knows the shape
};

// Using Solution 2 (more flexible)
const example2: DerivedValueAlt<Person, 'firstName' | 'lastName'> = {
  value: { firstName: 'Jane', lastName: 'Smith', age: 25 },
  deps: ['firstName', 'lastName'],
  derive: (value) => `${value.firstName} ${value.lastName}`, // ✅ TypeScript knows the shape
};

// Solution 3: Using a helper function for better type inference
function createDerived<T, K extends keyof T>(config: {
  value: T;
  deps: K[];
  derive: (value: Pick<T, K>) => string;
}) {
  return config;
}

// This gives the best inference without explicit type annotations
const example3 = createDerived({
  value: { firstName: 'Bob', lastName: 'Johnson', age: 40 },
  deps: ['firstName', 'lastName'],
  derive: (value) => `${value.firstName} ${value.lastName}`, // ✅ Perfect inference!
});

// Example with single dependency
const example4 = createDerived({
  value: { firstName: 'Alice', lastName: 'Williams', age: 35 },
  deps: ['age'],
  derive: (value) => `Age: ${value.age}`,
});

export type { DerivedValue, DerivedValueAlt };
export { createDerived };
