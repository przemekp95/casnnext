import {
  defineGlobal,
  installEdgeFetchPrimitives,
  type EdgeFetchPrimitives,
} from '@/test/setup/edge-fetch-primitives';

describe('edge fetch primitives', () => {
  const originalDescriptors = new Map<PropertyKey, PropertyDescriptor | undefined>();

  function rememberGlobal(key: PropertyKey) {
    if (!originalDescriptors.has(key)) {
      originalDescriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    }
  }

  afterEach(() => {
    for (const [key, descriptor] of originalDescriptors) {
      if (descriptor) {
        Object.defineProperty(globalThis, key, descriptor);
      } else {
        Reflect.deleteProperty(globalThis, key);
      }
    }
    originalDescriptors.clear();
  });

  it('installs missing primitives without overwriting existing globals', () => {
    const existingHeaders = class ExistingHeaders {} as unknown as typeof Headers;
    const fakePrimitives = {
      Headers: class FakeHeaders {},
      Request: class FakeRequest {},
      Response: class FakeResponse {},
      FormData: class FakeFormData {},
      File: class FakeFile {},
      Blob: class FakeBlob {},
    } as unknown as EdgeFetchPrimitives;

    for (const key of Object.keys(fakePrimitives) as Array<keyof EdgeFetchPrimitives>) {
      rememberGlobal(key);
      Reflect.deleteProperty(globalThis, key);
    }
    defineGlobal('Headers', existingHeaders);

    installEdgeFetchPrimitives(fakePrimitives);

    expect(globalThis.Request).toBe(fakePrimitives.Request);
    expect(globalThis.Headers).toBe(existingHeaders);
  });

  it('defines writable and configurable globals', () => {
    const key = Symbol('edge-fetch-test');
    rememberGlobal(key);

    defineGlobal(key, 'first');
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);

    expect(descriptor).toMatchObject({
      value: 'first',
      writable: true,
      configurable: true,
    });
  });
});
