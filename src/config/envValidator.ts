import { logError } from "../logging/logger.js";
import dotenv from "dotenv";

dotenv.config();

const requiredEnvVars = [
    "DISCORD_TOKEN",
    "DISCORD_GUILD_ID"
];

let failed = false;

for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
        console.error(`🚨 FATAL: Missing required environment variable: ${envVar}`);
        failed = true;
    }
}

// Ensure the bot doesn't start if it has no brains
if (!process.env.GROQ_API_KEY && !process.env.GEMINI_API_KEY && !process.env.ANTHROPIC_API_KEY && !process.env.OLLAMA_HOST) {
    console.error(`🚨 FATAL: You must provide at least one AI Provider API Key (GROQ, GEMINI, or ANTHROPIC) in your .env file!`);
    failed = true;
}

if (failed) {
    console.error("❌ Environment validation failed. Safe-mode exit.");
    process.exit(1);
}
