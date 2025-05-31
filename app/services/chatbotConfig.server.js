import redis from '../redis.server.js'; // Assuming redis.server.js is in app/
import { defaultChatbotConfig } from './chatbotConfig.defaults.js';

/**
 * Helper function to check if an item is a plain object.
 * @param {*} item - The item to check.
 * @returns {boolean} True if the item is a plain object, false otherwise.
 */
function isObject(item) {
  return item && typeof item === 'object' && !Array.isArray(item);
}

/**
 * Deeply merges properties from a source object into a target object.
 * This function creates new objects and arrays to avoid modifying the original sources.
 * For arrays, this implementation replaces the target array with a deep clone of the source array.
 *
 * @param {object} target - The target object to merge into.
 * @param {object} source - The source object from which to merge properties.
 * @returns {object} A new object representing the merged result.
 */
function deepMerge(target, source) {
  // Create a new object that is a deep clone of the target initially.
  // This ensures that if source is empty or has no overlapping keys, we still get a deep copy of target.
  let output = Array.isArray(target) ? [] : {};

  if (Array.isArray(target)) {
    // For the initial call, if target is an array (e.g. defaultChatbotConfig.functionality.multiStepDialogs)
    // we typically want to replace it with source's array if source provides one.
    // However, the primary use here is merging objects, so target being an array is less common for the top-level call.
    // This implementation will simply make a deep copy of the target array.
    // If source is also an array, the subsequent loop for source keys will overwrite 'output'.
    output = target.map(item => (isObject(item) ? deepMerge({}, item) : item));
  } else if (isObject(target)) {
    for (const key of Object.keys(target)) {
      if (isObject(target[key])) {
        output[key] = deepMerge({}, target[key]); // Deep clone nested objects from target
      } else if (Array.isArray(target[key])) {
        output[key] = target[key].map(item => (isObject(item) ? deepMerge({}, item) : item)); // Deep clone arrays from target
      } else {
        output[key] = target[key];
      }
    }
  }

  // Now, merge source into the cloned target (output).
  if (isObject(source)) {
    for (const key of Object.keys(source)) {
      if (isObject(source[key])) {
        // If the key exists in output (cloned target) and is an object, recurse.
        // Otherwise, or if key not in output, create a new object by deep cloning source[key].
        if (output[key] && isObject(output[key])) {
          output[key] = deepMerge(output[key], source[key]);
        } else {
          output[key] = deepMerge({}, source[key]); // Source has object, target doesn't or isn't object at this key
        }
      } else if (Array.isArray(source[key])) {
        // Replace array from source, deep cloning its elements
        output[key] = source[key].map(item => (isObject(item) ? deepMerge({}, item) : item));
      } else {
        // Primitive value from source, assign directly.
        output[key] = source[key];
      }
    }
  }
  return output;
}

/**
 * Fetches the chatbot configuration for a given shopId.
 * It merges saved configuration from Redis with default configurations.
 *
 * @async
 * @param {string} shopId - The ID of the shop.
 * @returns {Promise<object>} The merged chatbot configuration.
 */
export async function getChatbotConfig(shopId) {
  if (!shopId) {
    console.error("getChatbotConfig: shopId is required.");
    return deepMerge({}, defaultChatbotConfig); // Return a copy of defaults
  }
  const redisKey = `chatbot_config:${shopId}`;
  let mergedConfig = deepMerge({}, defaultChatbotConfig); // Start with a deep copy of defaults

  try {
    const configString = await redis.get(redisKey);
    console.log(`RAW configString from Redis for shop ${shopId} (${redisKey}): [${configString}]`); // <-- ADDED THIS LINE
    if (configString) {
      try { // Added try-catch for JSON.parse
        const savedConfig = JSON.parse(configString);
        mergedConfig = deepMerge(mergedConfig, savedConfig);
      } catch (parseError) {
        console.error(`Error parsing configString for shop ${shopId} from Redis:`, parseError, `Raw string: [${configString}]`);
        // mergedConfig remains as defaults if parsing fails
      }
      console.log(`Configuration loaded from Redis for shop ${shopId} (or defaults if parsing failed).`);
    } else {
      console.log(`No configuration found in Redis for shop ${shopId}. Using defaults.`);
    }
  } catch (error) { // Catch errors from redis.get itself
    console.error(`Error fetching config for shop ${shopId} from Redis (redis.get failed):`, error);
    // In case of redis.get error, mergedConfig still holds the deep copy of defaults
  }
  return mergedConfig;
}

/**
 * Saves chatbot configuration updates for a given shopId.
 * It fetches the current configuration, merges updates, and saves back to Redis.
 *
 * @async
 * @param {string} shopId - The ID of the shop.
 * @param {object} configUpdates - An object containing partial or full configuration updates.
 * @returns {Promise<object|null>} The newly saved configuration object, or null if save failed.
 */
export async function saveChatbotConfig(shopId, configUpdates) {
  if (!shopId) {
    console.error("saveChatbotConfig: shopId is required.");
    return null;
  }
  if (!configUpdates || typeof configUpdates !== 'object') {
    console.error("saveChatbotConfig: configUpdates must be an object.");
    return null;
  }

  try {
    // Fetch current config (which includes defaults + previously saved settings)
    const currentStoredConfig = await getChatbotConfig(shopId);

    // Merge the new updates onto the current configuration
    const newConfig = deepMerge(currentStoredConfig, configUpdates);

    const configString = JSON.stringify(newConfig);
    const redisKey = `chatbot_config:${shopId}`;

    await redis.set(redisKey, configString);
    console.log(`Chatbot configuration saved for shop ${shopId}.`);
    return newConfig;
  } catch (error) {
    console.error(`Error saving config for shop ${shopId} to Redis:`, error);
    return null;
  }
}
