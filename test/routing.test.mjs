import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAgentForPeer,
  buildBindingsForPeer,
  buildBindingForPeer,
  extractWhatsappSenderDigits,
  hasPeerBinding,
  isWhatsappEvent,
  upsertPeerRoute,
  whatsappPeerIds,
} from "../lib/routing.js";

test("extracts sender from WhatsApp JID fields", () => {
  const event = {
    channel: "whatsapp",
    senderId: "5212284100608@s.whatsapp.net",
  };

  assert.equal(extractWhatsappSenderDigits(event), "5212284100608");
});

test("extracts sender from OpenClaw WhatsApp prefix", () => {
  const event = {
    content: "[WhatsApp +5212281340032] hola",
  };

  assert.equal(isWhatsappEvent(event), true);
  assert.equal(extractWhatsappSenderDigits(event), "5212281340032");
});

test("ignores groups and configured own numbers", () => {
  assert.equal(extractWhatsappSenderDigits({ senderId: "120363@g.us" }), "");
  assert.equal(
    extractWhatsappSenderDigits(
      { senderId: "+5215658477702" },
      {},
      { ownNumbers: ["5215658477702"] },
    ),
    "",
  );
});

test("builds an OpenClaw peer binding", () => {
  assert.deepEqual(buildBindingForPeer("5212281340032"), {
    agentId: "wa5212281340032",
    match: {
      channel: "whatsapp",
      accountId: "*",
      peer: {
        kind: "direct",
        id: "+5212281340032",
      },
    },
  });
});

test("builds WhatsApp aliases for Mexico mobile marker variants", () => {
  assert.deepEqual(whatsappPeerIds("5212282365609"), [
    "+5212282365609",
    "5212282365609",
    "5212282365609@s.whatsapp.net",
    "+522282365609",
    "522282365609",
    "522282365609@s.whatsapp.net",
  ]);

  assert.equal(buildBindingsForPeer("5212282365609").length, 6);
});

test("upserts agent and keeps fallback binding last", () => {
  const draft = {
    agents: {
      list: [
        {
          id: "whatsapp",
          name: "WhatsApp",
          model: "openrouter/example",
          workspace: "~/.openclaw/workspace-whatsapp",
          agentDir: "~/.openclaw/agents/whatsapp/agent",
        },
      ],
    },
    bindings: [
      { agentId: "whatsapp", match: { channel: "whatsapp", accountId: "*" } },
    ],
  };

  const result = upsertPeerRoute(draft, "5212281340032");

  assert.equal(result.changed, true);
  assert.equal(result.agentId, "wa5212281340032");
  assert.equal(draft.agents.list.at(-1).model, "openrouter/example");
  assert.equal(hasPeerBinding(draft.bindings, "5212281340032"), true);
  assert.equal(draft.bindings.at(-1).agentId, "whatsapp");
  assert.equal(draft.bindings.filter((binding) => binding.match?.peer).length, 6);
});

test("agent gets isolated workspace and agentDir", () => {
  const agent = buildAgentForPeer("5212281340032", {}, { model: "openrouter/example" });

  assert.equal(agent.id, "wa5212281340032");
  assert.equal(agent.workspace, "~/.openclaw/workspace-wa5212281340032");
  assert.equal(agent.agentDir, "~/.openclaw/agents/wa5212281340032/agent");
  assert.equal(agent.model, "openrouter/example");
});
