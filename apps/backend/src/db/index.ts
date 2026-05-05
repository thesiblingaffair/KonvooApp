import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";
import { env } from "../config/env.js";

const queryClient = postgres(env.DATABASE_URL, {
  max: 10,
  idle_timeout: 30,
  connect_timeout: 30,
  max_lifetime: 60 * 10,
});

export const db = drizzle(queryClient, { schema });

export async function testDbConnection(): Promise<void> {
  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await queryClient`SELECT 1`;
      console.log("✅ Supabase PostgreSQL connected");
      return;
    } catch (error) {
      console.error(`❌ DB connection attempt ${attempt}/${maxRetries} failed:`, (error as Error).message);
      if (attempt < maxRetries) {
        const delay = attempt * 3000;
        console.log(`⏳ Retrying in ${delay / 1000}s...`);
        await new Promise((r) => setTimeout(r, delay));
      } else {
        console.error("❌ All DB connection attempts failed — starting server anyway");
        // Don't throw — let the server start and retry on first request
      }
    }
  }
}
