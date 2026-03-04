module.exports = {
    apps: [
        {
            name: "sentinel-bot",
            script: "bot.mjs",
            instances: 1, // Bots should generally only have 1 instance to avoid duplicate responses
            autorestart: true,
            watch: false,
            max_memory_restart: "500M",
            env: {
                NODE_ENV: "production",
            },
        },
    ],
};
