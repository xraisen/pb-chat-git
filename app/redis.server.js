import { Redis } from '@upstash/redis';

let redis;

const redisUrl = process.env.KV_REST_API_URL;
const redisToken = process.env.KV_REST_API_TOKEN;

if (redisUrl && redisToken) {
  // Use Upstash Redis if KV_REST_API_URL and KV_REST_API_TOKEN are set
  redis = new Redis({
    url: redisUrl,
    token: redisToken,
  });
  console.log("Upstash Redis client initialized using KV_REST_API_URL.");
} else {
  // Fallback for local development or environments where Redis connection details are not set
  console.warn(
    "KV_REST_API_URL or KV_REST_API_TOKEN not found. " +
    "Using a mock Redis client. Chatbot configuration and analytics data will not persist globally."
  );

  // A simple mock that mimics the Upstash Redis client's API for get/set/del
  const mockStore = new Map();
  redis = {
    get: async (key) => {
      console.log(`Mock Redis: GET ${key}`);
      return mockStore.get(key) || null;
    },
    set: async (key, value) => {
      console.log(`Mock Redis: SET ${key}`, value);
      mockStore.set(key, value);
      return 'OK';
    },
    del: async (key) => {
      console.log(`Mock Redis: DEL ${key}`);
      const result = mockStore.delete(key) ? 1 : 0;
      return result;
    },
    // Add any other methods that might be used by other parts of the application
    // For example, if using Redis for rate limiting or other features:
    // incr: async (key) => {
    //   let value = mockStore.get(key) || 0;
    //   if (typeof value !== 'number') value = 0;
    //   value++;
    //   mockStore.set(key, value);
    //   return value;
    // },
    // expire: async (key, seconds) => {
    //   console.log(`Mock Redis: EXPIRE ${key} ${seconds} (not implemented in mock)`);
    //   return 1; // Mock success
    // }
  };

  // Log current NODE_ENV for context on why mock is being used
  if (process.env.NODE_ENV === 'production') {
    console.error(
      "CRITICAL WARNING: Mock Redis is active in a PRODUCTION environment! " +
      "This means KV_REST_API_URL or KV_REST_API_TOKEN are missing. Data will not persist."
    );
  } else {
    console.log(`Mock Redis client active in ${process.env.NODE_ENV || 'development'} environment.`);
  }
}

export default redis;
