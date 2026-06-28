# OpenClaw WhatsApp Auto Agent Binder

This plugin is the clean patch for the WhatsApp-session mixing problem.

OpenClaw's WhatsApp Web channel can receive all direct messages through one fallback agent. That keeps delivery working, but it can put several phone numbers in the same fallback conversation. This plugin listens for inbound WhatsApp messages, detects the sender phone number, and writes a dedicated agent plus peer binding:

```json
{
  "agentId": "wa5212281340032",
  "match": {
    "channel": "whatsapp",
    "accountId": "*",
    "peer": { "kind": "direct", "id": "+5212281340032" }
  }
}
```

After the binding exists, later messages from that number route to its own agent/session instead of the common fallback.

## Why this exists

The native config path looked like it should solve the issue with `session.dmScope`, but in this WhatsApp Web setup the practical isolation boundary is an agent binding per peer. A plugin or sidecar must create those bindings automatically when new numbers appear.

## Install

From a published Git repo:

```bash
openclaw plugins install git:github.com/<owner>/openclaw-wa-auto-agent@master
openclaw plugins enable wa-auto-agent
openclaw config set plugins.entries.whatsapp.config.pluginHooks.messageReceived true --strict-json
openclaw gateway restart
openclaw plugins inspect wa-auto-agent --runtime --json
```

For local development on the same machine as OpenClaw:

```bash
openclaw plugins install --link ./openclaw-wa-auto-agent-plugin
openclaw plugins enable wa-auto-agent
openclaw config set plugins.entries.whatsapp.config.pluginHooks.messageReceived true --strict-json
openclaw gateway restart
```

## Config

```json
{
  "enabled": true,
  "fallbackAgentId": "whatsapp",
  "agentPrefix": "wa",
  "accountId": "*",
  "model": "openrouter/deepseek/deepseek-v4-flash",
  "workspaceBase": "~/.openclaw",
  "ownNumbers": [],
  "dryRun": false,
  "logEvents": true
}
```

Set `ownNumbers` to the linked WhatsApp account number if self messages ever appear in logs.

## Reality check

This plugin can create the isolated route as soon as the WhatsApp plugin emits `message_received`. Depending on OpenClaw's inbound order, the very first message from a brand-new number may still hit the fallback agent, because the route did not exist before that message arrived. The important fix is that the next messages from that same number should route to its dedicated agent.

If runtime hooks do not fire on Hostinger, use `tools/openclaw-wa-autobinder.mjs --apply --watch` as the sidecar fallback. It performs the same config mutation by polling logs.

On the tested Hostinger OpenClaw instance, the Git installer cloned the repo but failed while moving it from `/tmp` to `/data` with `EXDEV: cross-device link not permitted`. In that environment, use a local path install if you can place files on the server, publish to npm/clawhub, or run the sidecar fallback from the operator machine.
