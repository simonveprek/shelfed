/// <reference types="vite/client" />

declare module "foliate-js/view.js" {
  export function makeBook(file: File | string): Promise<any>;
}

declare module "foliate-js/overlayer.js" {
  export const Overlayer: { highlight: unknown; outline: unknown; underline: unknown };
}
