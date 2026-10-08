import { test } from "node:test";
import assert from "node:assert/strict";

import {
  canSendTelegram,
  isTelegramActorAuthorized,
  loadTelegramConfig,
} from "../src/config/env.ts";

test("defaults: enabled, no token/chat, no allow-list", () => {
  const cfg = loadTelegramConfig({ env: {} });
  assert.equal(cfg.enabled, true);
  assert.equal(cfg.botToken, undefined);
  assert.equal(cfg.chatId, undefined);
  assert.deepEqual(cfg.allowedUserIds, []);
  assert.equal(canSendTelegram(cfg), false);
});

test("canSendTelegram requires enabled + token + chat id", () => {
  assert.equal(
    canSendTelegram(
      loadTelegramConfig({
        env: { TELEGRAM_BOT_TOKEN: "t", TELEGRAM_CHAT_ID: "123" },
      }),
    ),
    true,
  );
  assert.equal(
    canSendTelegram(
      loadTelegramConfig({
        env: {
          TELEGRAM_NOTIFICATIONS_ENABLED: "false",
          TELEGRAM_BOT_TOKEN: "t",
          TELEGRAM_CHAT_ID: "123",
        },
      }),
    ),
    false,
  );
  assert.equal(
    canSendTelegram(loadTelegramConfig({ env: { TELEGRAM_BOT_TOKEN: "t" } })),
    false,
  );
});

test("TELEGRAM_NOTIFICATIONS_ENABLED accepts the usual falsey spellings", () => {
  for (const v of ["0", "false", "FALSE", "no", "off"]) {
    assert.equal(
      loadTelegramConfig({ env: { TELEGRAM_NOTIFICATIONS_ENABLED: v } }).enabled,
      false,
      v,
    );
  }
  for (const v of ["1", "true", "yes", "on", "anything"]) {
    assert.equal(
      loadTelegramConfig({ env: { TELEGRAM_NOTIFICATIONS_ENABLED: v } }).enabled,
      true,
      v,
    );
  }
});

test("TELEGRAM_ALLOWED_USER_IDS splits on comma/whitespace", () => {
  const cfg = loadTelegramConfig({
    env: { TELEGRAM_ALLOWED_USER_IDS: "111, 222   333" },
  });
  assert.deepEqual(cfg.allowedUserIds, ["111", "222", "333"]);
});

test("isTelegramActorAuthorized: chat must match", () => {
  const cfg = loadTelegramConfig({
    env: { TELEGRAM_BOT_TOKEN: "t", TELEGRAM_CHAT_ID: "123" },
  });
  assert.equal(
    isTelegramActorAuthorized(cfg, { chatId: 123, userId: 999 }),
    true,
    "no allow-list → any user in the chat",
  );
  assert.equal(
    isTelegramActorAuthorized(cfg, { chatId: 456, userId: 999 }),
    false,
    "wrong chat",
  );
});

test("isTelegramActorAuthorized: allow-list restricts the user", () => {
  const cfg = loadTelegramConfig({
    env: {
      TELEGRAM_BOT_TOKEN: "t",
      TELEGRAM_CHAT_ID: "123",
      TELEGRAM_ALLOWED_USER_IDS: "42, 43",
    },
  });
  assert.equal(isTelegramActorAuthorized(cfg, { chatId: 123, userId: 42 }), true);
  assert.equal(
    isTelegramActorAuthorized(cfg, { chatId: "123", userId: "43" }),
    true,
    "string ids compare equal",
  );
  assert.equal(
    isTelegramActorAuthorized(cfg, { chatId: 123, userId: 99 }),
    false,
    "user not on the allow-list",
  );
});

test("isTelegramActorAuthorized: no chat configured → deny", () => {
  const cfg = loadTelegramConfig({ env: { TELEGRAM_BOT_TOKEN: "t" } });
  assert.equal(isTelegramActorAuthorized(cfg, { chatId: 1, userId: 1 }), false);
});
