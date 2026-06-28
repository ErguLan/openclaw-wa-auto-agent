import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import {
  PLUGIN_ID,
  extractWhatsappSenderDigits,
  isWhatsappEvent,
  normalizeConfig,
  upsertPeerRoute,
} from "./lib/routing.js";

export default definePluginEntry({
  id: PLUGIN_ID,
  name: "WhatsApp Auto Agent Binder",
  description: "Auto-creates isolated OpenClaw agents and bindings for new WhatsApp DM senders.",
  register(api) {
    api.on(
      "message_received",
      async (event, ctx) => {
        const config = readPluginConfig(api, event, ctx);
        if (!config.enabled) return;
        if (!isWhatsappEvent(event, ctx)) return;

        const digits = extractWhatsappSenderDigits(event, ctx, config);
        if (!digits) {
          log(api, "debug", "WhatsApp event did not expose a direct sender id.");
          return;
        }

        if (config.dryRun) {
          log(api, "info", `Dry run: would create isolated route for WhatsApp +${digits}.`);
          return;
        }

        const result = await mutateRoute(api, digits, config);
        if (result?.changed && config.logEvents) {
          log(api, "info", `Created isolated WhatsApp route for +${digits} -> ${result.agentId}.`);
        }
      },
      { priority: 1000, timeoutMs: 30_000 },
    );
  },
});

function readPluginConfig(api, event, ctx) {
  let configured = event?.context?.pluginConfig || ctx?.pluginConfig || api?.config || api?.pluginConfig || {};
  try {
    const snapshot = api?.runtime?.config?.current?.();
    configured = snapshot?.plugins?.entries?.[PLUGIN_ID]?.config || configured;
  } catch (error) {
    log(api, "debug", `Could not read runtime config snapshot: ${error.message}`);
  }
  return normalizeConfig(configured);
}

async function mutateRoute(api, digits, config) {
  const mutate = (draft) => upsertPeerRoute(draft, digits, config);
  const runtimeConfig = api?.runtime?.config;

  if (typeof runtimeConfig?.mutateConfigFile === "function") {
    let outcome = { changed: false, agentId: "" };
    await runtimeConfig.mutateConfigFile({
      afterWrite: {
        mode: "restart",
        reason: config.restartReason,
      },
      mutate(draft) {
        outcome = mutate(draft);
      },
    });
    return outcome;
  }

  // Compatibility fallback for older plugin API builds.
  if (typeof runtimeConfig?.loadConfig === "function" && typeof runtimeConfig?.writeConfigFile === "function") {
    const draft = await runtimeConfig.loadConfig();
    const outcome = mutate(draft);
    if (outcome.changed) await runtimeConfig.writeConfigFile(draft);
    return outcome;
  }

  throw new Error("OpenClaw runtime config mutation API is unavailable.");
}

function log(api, level, message) {
  const logger = api?.logger || console;
  const fn = logger[level] || logger.log || console.log;
  fn.call(logger, `[${PLUGIN_ID}] ${message}`);
}
