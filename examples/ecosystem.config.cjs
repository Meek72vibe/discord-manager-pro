{
    "name": "sentinel",
        "script": "bot.mjs",
            "instances": "max",
                "exec_mode": "cluster",
                    "env": {
        "NODE_ENV": "production",
            "DISCORD_TOKEN": "your_bot_token",
                "DISCORD_GUILD_ID": "your_server_id",
                    "GEMINI_API_KEY": "AIzaSy_xxxx",
                        "SAFE_MODE": "false",
                            "READ_ONLY": "false"
    }
}
