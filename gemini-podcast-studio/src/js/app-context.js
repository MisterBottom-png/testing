export function createAppContext() {
  const context = Object.create(null);

  Object.defineProperties(context, {
    expose: {
      enumerable: false,
      value(name, value) {
        Object.defineProperty(context, name, { configurable: true, enumerable: true, writable: true, value });
        return value;
      }
    },
    defineMutable: {
      enumerable: false,
      value(name, getValue, setValue) {
        Object.defineProperty(context, name, {
          configurable: true,
          enumerable: true,
          get: getValue,
          set: setValue
        });
      }
    }
  });

  return context;
}
