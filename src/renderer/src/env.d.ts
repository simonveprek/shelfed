/// <reference types="vite/client" />

declare module "foliate-js/view.js" {
  export function makeBook(file: File | string): Promise<any>;
}

declare module "foliate-js/overlayer.js" {
  export const Overlayer: { highlight: unknown; outline: unknown; underline: unknown };
}

declare module "foliate-js/mobi.js" {
  export class MOBI {
    constructor(options: { unzlib: (data: Uint8Array) => Uint8Array });
    open(file: Blob): Promise<any>;
  }
}
