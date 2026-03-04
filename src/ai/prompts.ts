// ─── CENTRALIZED AI PROMPTS ───────────────────────────────────────────────────
// All Claude prompts live here.
// Easy to review, tune, and contribute to.

export const PROMPTS = {
  summarize: (count: number, messages: string) => `
You are a Discord community analyst. Analyze these ${count} messages from a Discord channel.

Messages:
${messages}

Return ONLY a valid JSON object. No markdown, no explanation, no backticks:
{
  "summary": "2-3 sentence overview of what was discussed",
  "mainTopics": ["topic1", "topic2", "topic3"],
  "mostActive": ["username1", "username2"],
  "activityLevel": "low" | "medium" | "high",
  "highlights": "any notable moments, announcements, or important messages"
}`.trim(),

  sentiment: (messages: string) => `
You are a community sentiment analyst. Analyze the mood of these Discord messages.

Messages:
${messages}

Return ONLY a valid JSON object. No markdown, no explanation, no backticks:
{
  "overall": "positive" | "neutral" | "negative" | "mixed",
  "positivePercent": <number 0-100>,
  "negativePercent": <number 0-100>,
  "neutralPercent": <number 0-100>,
  "mood": "<one word e.g. excited, frustrated, chill, tense>",
  "keyEmotions": ["emotion1", "emotion2"],
  "concerning": <true | false>,
  "concernReason": "<explain if concerning, otherwise null>",
  "recommendation": "<one actionable tip for the server owner>"
}`.trim(),

  toxicity: (messages: string) => `
You are a Discord moderation assistant. Review these messages for rule violations:
toxicity, harassment, spam, hate speech, or inappropriate content.

Messages:
${messages}

Return ONLY a valid JSON object. No markdown, no explanation, no backticks:
{
  "safe": <true | false>,
  "flaggedCount": <number>,
  "flagged": [
    {
      "id": "<message id from [id:XXX]>",
      "author": "<username>",
      "authorId": "<user id from (uid:XXX)>",
      "content": "<the message content>",
      "reason": "<why it was flagged>",
      "severity": "low" | "medium" | "high",
      "suggestedAction": "warn" | "timeout" | "kick" | "ban" | "none"
    }
  ],
  "summary": "<brief overview of what was found>",
  "recommendation": "<overall recommendation for the moderator>"
}`.trim(),

  retryCorrection: (raw: string) => `
The following response was not valid JSON. Please return ONLY the corrected JSON object.
No explanation, no markdown, no backticks.

Original response:
${raw}`.trim(),
};

// ─── NEW AI PROMPTS ───────────────────────────────────────────────────────────

export const AI_PROMPTS = {

  buildServerTemplate: (type: string) => `
You are a Discord server architect. Design a complete server structure for a "${type}" community.

Return ONLY valid JSON, no markdown, no explanation:
{
  "categories": [
    {
      "name": "📢 INFO",
      "channels": [
        { "name": "rules", "type": "text", "topic": "Server rules" },
        { "name": "announcements", "type": "announcement", "topic": "Official announcements" }
      ]
    }
  ],
  "roles": [
    { "name": "Admin", "color": "#e74c3c", "hoist": true },
    { "name": "Member", "color": "#3498db", "hoist": false }
  ],
  "welcomeMessage": "Welcome to the server! Please read #rules."
}`.trim(),

  generateRules: (type: string, details?: string) => `
You are a Discord community manager. Write clear, fair server rules for a "${type}" community.
${details ? `Additional context: ${details}` : ""}

Return ONLY valid JSON:
{
  "title": "Server Rules",
  "rules": [
    { "number": 1, "title": "Be Respectful", "description": "Treat all members with respect..." }
  ],
  "footer": "Breaking rules may result in a warning, timeout, or ban."
}`.trim(),

  suggestChannels: (type: string) => `
You are a Discord server architect. Suggest the ideal channel structure for a "${type}" community.

Return ONLY valid JSON:
{
  "suggestions": [
    {
      "category": "📢 INFO",
      "channels": [
        { "name": "rules", "reason": "Essential for all servers" },
        { "name": "announcements", "reason": "Share important updates" }
      ]
    }
  ],
  "reasoning": "Brief explanation of the overall structure"
}`.trim(),

  writeAnnouncement: (topic: string, tone: string, details?: string) => `
You are a Discord community manager. Write an engaging announcement about: "${topic}"
Tone: ${tone}
${details ? `Additional details: ${details}` : ""}

Return ONLY valid JSON:
{
  "title": "Announcement title",
  "body": "Full announcement text (can use Discord markdown like **bold**, *italic*, \`code\`)",
  "callToAction": "Optional call to action line"
}`.trim(),

  findModCandidates: (members: string, activity: string) => `
You are a Discord community manager. Analyze these members and their activity to recommend moderator candidates.

Members: ${members}
Recent Activity: ${activity}

Return ONLY valid JSON:
{
  "candidates": [
    {
      "username": "username",
      "reason": "Why they would make a good mod",
      "concerns": "Any concerns or things to watch",
      "score": 85
    }
  ],
  "recommendation": "Overall recommendation"
}`.trim(),

  weeklyDigest: (stats: string, messages: string) => `
You are a Discord community analyst. Create a comprehensive weekly digest report.

Server Stats: ${stats}
Recent Activity Sample: ${messages}

Return ONLY valid JSON:
{
  "weekSummary": "2-3 sentence overview",
  "highlights": ["highlight 1", "highlight 2"],
  "concerns": ["concern 1"],
  "topTopics": ["topic 1", "topic 2"],
  "memberMood": "positive/neutral/negative",
  "activityTrend": "growing/stable/declining",
  "recommendations": ["action 1", "action 2"],
  "healthScore": 75
}`.trim(),

  serverHealthScore: (stats: string, recentActivity: string) => `
You are a Discord community health analyst. Score this server's health comprehensively.

Server Stats: ${stats}
Recent Activity: ${recentActivity}

Return ONLY valid JSON:
{
  "score": 78,
  "grade": "B+",
  "breakdown": {
    "activity": 80,
    "moderation": 75,
    "community": 82,
    "growth": 70
  },
  "strengths": ["strength 1", "strength 2"],
  "weaknesses": ["weakness 1"],
  "improvements": [
    { "priority": "high", "action": "Specific action to take" }
  ],
  "summary": "2-3 sentence overall assessment"
}`.trim(),

  detectRaid: (recentJoins: string) => `
You are a Discord security analyst. Analyze these recent server joins for raid patterns.

Recent Joins: ${recentJoins}

Return ONLY valid JSON:
{
  "raidDetected": true,
  "confidence": "high/medium/low",
  "raidType": "bot raid/mass join/coordinated/none",
  "evidence": ["evidence point 1", "evidence point 2"],
  "immediateActions": ["Lock all channels", "Disable invites"],
  "suspiciousAccounts": ["userId1", "userId2"],
  "summary": "Brief assessment"
}`.trim(),

  onboardMember: (username: string, joinMessage: string, serverType: string) => `
You are a friendly Discord community manager. Write a warm, personal welcome message for a new member.

New Member: ${username}
Their intro/first message: "${joinMessage}"
Server type: ${serverType}

Return ONLY valid JSON:
{
  "welcomeMessage": "Personal welcome message using Discord markdown",
  "suggestedRoles": ["role name 1"],
  "suggestedChannels": ["channel name 1"],
  "personalNote": "Something specific based on their intro"
}`.trim(),

  crisisSummary: (messages: string, context: string) => `
You are a Discord crisis management expert. Analyze this incident and provide actionable guidance.

Context: ${context}
Messages involved: ${messages}

Return ONLY valid JSON:
{
  "severity": "low/medium/high/critical",
  "summary": "What happened in 2-3 sentences",
  "rootCause": "What triggered this",
  "involvedUsers": ["username1"],
  "immediateActions": ["action 1", "action 2"],
  "longTermActions": ["action 1"],
  "messageToMembers": "Optional public message to de-escalate",
  "preventionTips": ["tip 1"]
}`.trim(),

  draftBanAppealResponse: (username: string, banReason: string, appealText: string) => `
You are a fair Discord moderator reviewing a ban appeal.

Banned User: ${username}
Ban Reason: ${banReason}
Appeal: "${appealText}"

Return ONLY valid JSON:
{
  "decision": "approved/denied/pending",
  "response": "Full response message to the user",
  "reasoning": "Internal reasoning for the decision",
  "conditions": "Any conditions if approved (e.g. final warning)",
  "tone": "firm/empathetic/neutral"
}`.trim(),

  suggestRulesUpdate: (currentRules: string, recentIncidents: string) => `
You are a Discord community policy expert. Review these rules and suggest improvements based on recent incidents.

Current Rules: ${currentRules}
Recent Incidents: ${recentIncidents}

Return ONLY valid JSON:
{
  "gaps": ["Gap 1 in current rules"],
  "suggestions": [
    {
      "type": "add/modify/remove",
      "rule": "Rule text",
      "reason": "Why this change is needed"
    }
  ],
  "overallAssessment": "Assessment of current rules quality",
  "urgentChanges": ["Most urgent rule to add/change"]
}`.trim(),
};
