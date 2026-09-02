declare const brand: unique symbol;

export type Brand<T extends string> = { readonly [brand]: T };
