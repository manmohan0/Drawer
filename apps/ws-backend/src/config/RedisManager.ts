import { createClient, RedisClientType } from "redis";

export class RedisManager {
  private static instance: RedisManager;
  private client: RedisClientType;
  private subClient: RedisClientType;

  private constructor() {
    const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
    this.client = createClient({ url: redisUrl });
    this.client.on("error", (err) => console.error("Redis Client Error", err));
    this.client.connect().catch((err) => {
      console.error("Redis connection failed:", err);
    });

    this.subClient = this.client.duplicate();
    this.subClient.on("error", (err) => console.error("Redis Sub Client Error", err));
    this.subClient.connect().catch((err) => {
      console.error("Redis sub connection failed:", err);
    });
  }

  public static getInstance(): RedisManager {
    if (!RedisManager.instance) {
      RedisManager.instance = new RedisManager();
    }
    return RedisManager.instance;
  }

  public getClient(): RedisClientType {
    return this.client;
  }

  public getSubClient(): RedisClientType {
    return this.subClient;
  }
}
