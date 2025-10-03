import { createClient } from 'redis';

let redisClient = null;

export async function initializeRedis() {
  if (redisClient) return redisClient;
  
  try {
    // Use Redis Cloud configuration if credentials are available
    if (process.env.REDIS_HOST && process.env.REDIS_PASSWORD) {
      redisClient = createClient({
        username: 'default',
        password: process.env.REDIS_PASSWORD,
        socket: {
          host: process.env.REDIS_HOST,
          port: parseInt(process.env.REDIS_PORT || '6379')
        }
      });
    } else if (process.env.REDIS_URL) {
      // Fallback to Redis URL format
      redisClient = createClient({
        url: process.env.REDIS_URL
      });
    } else {
      // Local Redis
      redisClient = createClient({
        url: 'redis://localhost:6379'
      });
    }
    
    await redisClient.connect();
    console.log('✅ Redis connected successfully');
    
    redisClient.on('error', (err) => {
      console.error('Redis error:', err);
    });
    
    return redisClient;
  } catch (error) {
    console.error('Failed to connect to Redis:', error);
    return null;
  }
}

export function getRedisClient() {
  if (!redisClient) {
    throw new Error('Redis client not initialized. Call initializeRedis() first.');
  }
  return redisClient;
}