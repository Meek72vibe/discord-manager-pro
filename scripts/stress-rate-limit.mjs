import { checkDestructiveRateLimit } from "../src/core/rateLimiter.js";
import { LIMITS } from "../src/config/limits.js";

console.log("🔥 Starting Load Test on Rate Limiter 🔥");

const GUILD_ID = "test_guild_999";
const TOOL_NAME = "mass_ban";

let allowed = 0;
let blocked = 0;

for (let i = 0; i < (LIMITS.DESTRUCTIVE_RATE_LIMIT * 3); i++) {
    const limited = checkDestructiveRateLimit(GUILD_ID, TOOL_NAME);
    if (limited) {
        blocked++;
    } else {
        allowed++;
    }
}

console.log(`Allowed executions: ${allowed} / ${LIMITS.DESTRUCTIVE_RATE_LIMIT}`);
console.log(`Blocked executions: ${blocked} / ${LIMITS.DESTRUCTIVE_RATE_LIMIT * 2}`);

if (allowed === LIMITS.DESTRUCTIVE_RATE_LIMIT && blocked === (LIMITS.DESTRUCTIVE_RATE_LIMIT * 2)) {
    console.log("✅ Stress Test Passed.");
    process.exit(0);
} else {
    console.error("❌ Stress Test Failed!");
    process.exit(1);
}
