import crypto from 'crypto';

export class UserIdentityManager {
  constructor(redis) {
    this.redis = redis;
    this.keyPrefix = 'user:';
  }

  // Generate a unique user hash based on client information
  generateUserHash(clientInfo) {
    // Create a hash based on IP, user agent, and a random component
    const data = `${clientInfo.ip}_${clientInfo.userAgent}_${Date.now()}_${Math.random()}`;
    return crypto.createHash('sha256').update(data).digest('hex').substring(0, 16);
  }

  // Store user identity
  async storeUserIdentity(userHash, userData) {
    if (!this.redis) return;
    
    try {
      const key = `${this.keyPrefix}${userHash}`;
      const data = {
        hash: userHash,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        ...userData
      };
      
      await this.redis.set(key, JSON.stringify(data));
      
      // Set expiry to 30 days of inactivity
      await this.redis.expire(key, 30 * 24 * 60 * 60);
    } catch (error) {
      console.error('Failed to store user identity:', error);
    }
  }

  // Get user identity
  async getUserIdentity(userHash) {
    if (!this.redis) return null;
    
    try {
      const data = await this.redis.get(`${this.keyPrefix}${userHash}`);
      if (data) {
        const userData = JSON.parse(data);
        // Update last seen
        userData.lastSeen = Date.now();
        await this.storeUserIdentity(userHash, userData);
        return userData;
      }
      return null;
    } catch (error) {
      console.error('Failed to get user identity:', error);
      return null;
    }
  }

  // Check if user hash exists
  async userHashExists(userHash) {
    if (!this.redis) return false;
    
    try {
      return await this.redis.exists(`${this.keyPrefix}${userHash}`);
    } catch (error) {
      console.error('Failed to check user hash:', error);
      return false;
    }
  }

  // Get or create user hash from cookie/session
  async getOrCreateUserHash(clientInfo, existingHash = null) {
    // If user provided a hash, verify it exists
    if (existingHash) {
      const exists = await this.userHashExists(existingHash);
      if (exists) {
        await this.getUserIdentity(existingHash); // Updates last seen
        return existingHash;
      }
    }
    
    // Generate new hash
    const newHash = this.generateUserHash(clientInfo);
    await this.storeUserIdentity(newHash, {
      ip: clientInfo.ip,
      userAgent: clientInfo.userAgent,
      createdAt: Date.now()
    });
    
    return newHash;
  }
}