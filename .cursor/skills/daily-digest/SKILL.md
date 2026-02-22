---
name: daily-digest
description: Generates a comprehensive daily market morning report by delegating the task entirely to the daily-market-reporter subagent. Use when the user asks for a daily digest, morning report, market summary, or uses the /daily_digest command.
---

# Daily Digest Generator

## Core Purpose

The ONLY purpose of this skill is to act as a trigger to invoke the specialized `daily-market-reporter` subagent. 

Do not attempt to read the market data files, analyze the news, or write the report yourself. You must delegate this entire workload to the subagent.

## Instructions

When the user asks for a daily digest (e.g., "/daily_digest", "generate morning report", "今天的晨报"):

1. **Invoke the Subagent**: Immediately use the Task tool to launch the `daily-market-reporter` subagent.
2. **Set the Prompt**: Provide a clear prompt to the subagent, such as:
   *"Please generate today's comprehensive market morning report based on the fetched JSON data in the reports directory."*
3. **Use the Correct Model**: Ensure the subagent is invoked using the most capable model available (e.g., Gemini 3.1 Pro) as required by the subagent's own system prompt.
4. **Deliver the Result**: Once the subagent returns the completed markdown report, present it directly to the user in your response.

## Example Workflow

User: `/daily_digest`

Agent Action:
1. Calls the `Task` tool with `subagent_type: "daily-market-reporter"`.
2. Waits for the subagent to complete the data reading and analysis.
3. Outputs the subagent's generated report to the user.
