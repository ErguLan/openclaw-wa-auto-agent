export const PLUGIN_ID = "wa-auto-agent";

export const DEFAULT_CONFIG = Object.freeze({
  enabled: true,
  fallbackAgentId: "whatsapp",
  agentPrefix: "wa",
  accountId: "*",
  model: "openrouter/deepseek/deepseek-v4-flash",
  workspaceBase: "~/.openclaw",
  ownNumbers: [],
  dryRun: false,
  logEvents: true,
  restartReason: "wa-auto-agent added a WhatsApp peer binding",
});

export function normalizeConfig(value = {}) {
  const config = { ...DEFAULT_CONFIG, ...(value && typeof value === "object" ? value : {}) };
  const ownNumbers = config.ownNumbers instanceof Set
    ? [...config.ownNumbers]
    : Array.isArray(config.ownNumbers)
    ? config.ownNumbers
    : [];
  config.ownNumbers = new Set(ownNumbers.map(normalizeDigits).filter(Boolean));
  config.agentPrefix = safeIdentifierPart(config.agentPrefix || DEFAULT_CONFIG.agentPrefix);
  config.workspaceBase = String(config.workspaceBase || DEFAULT_CONFIG.workspaceBase).replace(/\/+$/g, "");
  return config;
}

export function normalizeDigits(value) {
  return String(value || "").replace(/[^\d]/g, "");
}

export function normalizeWhatsappDigits(value) {
  const raw = String(value || "");
  if (/@g\.us\b/i.test(raw)) return "";

  const jidMatch = raw.match(/(?:^|[^\d])(\d{10,15})@s\.whatsapp\.net\b/i);
  if (jidMatch) return normalizeDigits(jidMatch[1]);

  const bracketMatch = raw.match(/\[WhatsApp\s+(\+?\d{10,15})\]/i);
  if (bracketMatch) return normalizeDigits(bracketMatch[1]);

  const plusMexicoMatch = raw.match(/(?:^|[^\d])(\+?52\d{10,13})(?:[^\d]|$)/);
  if (plusMexicoMatch) return normalizeDigits(plusMexicoMatch[1]);

  const explicitMatch = raw.match(/(?:sender|from|peer|jid|remoteJid|senderId)[^\d+]{0,16}(\+?\d{10,15})/i);
  if (explicitMatch) return normalizeDigits(explicitMatch[1]);

  return "";
}

export function isWhatsappEvent(event = {}, ctx = {}) {
  const values = collectCandidateStrings(event, ctx);
  return values.some((value) => /whatsapp|s\.whatsapp\.net/i.test(value));
}

export function extractWhatsappSenderDigits(event = {}, ctx = {}, rawConfig = {}) {
  const config = normalizeConfig(rawConfig);
  const candidates = collectCandidateStrings(event, ctx);

  for (const value of candidates) {
    const digits = normalizeWhatsappDigits(value);
    if (isUsableSender(digits, config)) return digits;
  }

  return "";
}

export function buildAgentId(digits, rawConfig = {}) {
  const config = normalizeConfig(rawConfig);
  return `${config.agentPrefix}${safeIdentifierPart(digits)}`;
}

export function buildAgentForPeer(digits, rawConfig = {}, fallbackAgent = null) {
  const config = normalizeConfig(rawConfig);
  const id = buildAgentId(digits, config);
  return {
    ...(fallbackAgent && typeof fallbackAgent === "object" ? fallbackAgent : {}),
    id,
    name: `WA +${digits}`,
    workspace: `${config.workspaceBase}/workspace-${id}`,
    agentDir: `${config.workspaceBase}/agents/${id}/agent`,
    model: fallbackAgent?.model || config.model,
  };
}

export function buildBindingForPeer(digits, rawConfig = {}) {
  const config = normalizeConfig(rawConfig);
  return {
    agentId: buildAgentId(digits, config),
    match: {
      channel: "whatsapp",
      accountId: config.accountId,
      peer: {
        kind: "direct",
        id: `+${digits}`,
      },
    },
  };
}

export function hasAgent(agents, agentId) {
  return Array.isArray(agents) && agents.some((agent) => agent?.id === agentId);
}

export function hasPeerBinding(bindings, digits) {
  const peerId = `+${digits}`;
  return Array.isArray(bindings) && bindings.some((binding) => (
    binding?.match?.channel === "whatsapp"
    && binding?.match?.peer?.kind === "direct"
    && binding?.match?.peer?.id === peerId
  ));
}

export function upsertPeerRoute(draft, digits, rawConfig = {}) {
  const config = normalizeConfig(rawConfig);
  const agentId = buildAgentId(digits, config);

  draft.agents ??= {};
  draft.agents.list = Array.isArray(draft.agents.list) ? draft.agents.list : [];
  draft.bindings = Array.isArray(draft.bindings) ? draft.bindings : [];

  if (hasPeerBinding(draft.bindings, digits)) return { changed: false, agentId };

  const fallbackAgent = draft.agents.list.find((agent) => agent?.id === config.fallbackAgentId) || null;
  if (!hasAgent(draft.agents.list, agentId)) {
    draft.agents.list.push(buildAgentForPeer(digits, config, fallbackAgent));
  }

  const binding = buildBindingForPeer(digits, config);
  const specificBindings = draft.bindings.filter((item) => item?.match?.peer);
  const fallbackBindings = draft.bindings.filter((item) => !item?.match?.peer);
  draft.bindings = [...specificBindings, binding, ...fallbackBindings];

  return { changed: true, agentId };
}

function isUsableSender(digits, config) {
  return digits.length >= 10
    && digits.length <= 15
    && !config.ownNumbers.has(digits);
}

function collectCandidateStrings(event, ctx) {
  const values = [
    event?.senderId,
    event?.sender?.id,
    event?.sender?.jid,
    event?.sender?.phone,
    event?.peer?.id,
    event?.peerId,
    event?.thread?.id,
    event?.threadId,
    event?.from,
    event?.source,
    event?.channel,
    event?.channelId,
    event?.provider,
    event?.metadata?.from,
    event?.metadata?.senderId,
    event?.metadata?.remoteJid,
    event?.metadata?.jid,
    event?.message?.key?.remoteJid,
    event?.raw?.key?.remoteJid,
    event?.content,
    event?.text,
    event?.body,
    ctx?.senderId,
    ctx?.peerId,
    ctx?.channel,
    ctx?.channelId,
    ctx?.threadId,
  ];

  for (const message of event?.raw?.messages || []) {
    values.push(message?.key?.remoteJid, message?.message?.conversation);
  }

  if (Array.isArray(event?.content)) {
    for (const part of event.content) values.push(part?.text, part?.content);
  }

  return values
    .filter((value) => typeof value === "string" && value.trim())
    .map((value) => value.slice(0, 500));
}

function safeIdentifierPart(value) {
  return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "");
}
