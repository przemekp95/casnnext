class PrismaClient {
  constructor(options = {}) {
    this.options = options;
  }

  async $connect() {
    // Mock implementation for build
    return Promise.resolve();
  }

  async $disconnect() {
    // Mock implementation for build
    return Promise.resolve();
  }

  // Mock model properties
  get author() {
    return {
      findMany: () => Promise.resolve([]),
      findUnique: () => Promise.resolve(null),
      create: () => Promise.resolve({}),
      update: () => Promise.resolve({}),
      delete: () => Promise.resolve({})
    };
  }

  get analysis() {
    return {
      findMany: () => Promise.resolve([]),
      findUnique: () => Promise.resolve(null),
      create: () => Promise.resolve({}),
      update: () => Promise.resolve({}),
      delete: () => Promise.resolve({})
    };
  }
}

module.exports = { PrismaClient };
