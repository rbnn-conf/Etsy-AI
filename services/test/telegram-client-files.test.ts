import { test } from "node:test";
import assert from "node:assert/strict";
import { TelegramClient, TelegramError } from "../src/telegram/telegram-client.ts";

const TOKEN = "123456789:TEST_TOKEN_VALUE_NOT_REAL_xxxxxxxxxxxx";

test("getFile resolves a file_id to a path; downloadFile fetches bytes", async () => {
  const urls: string[] = [];
  const fetchImpl = (async (url: string) => {
    urls.push(url);
    if (url.endsWith("/getFile")) {
      return new Response(JSON.stringify({ ok: true, result: { file_path: "photos/file_1.jpg", file_size: 3 } }));
    }
    return new Response(new Uint8Array([1, 2, 3]));
  }) as typeof fetch;
  const c = new TelegramClient({ botToken: TOKEN, fetchImpl });
  const f = await c.getFile("abc");
  assert.deepEqual(f, { filePath: "photos/file_1.jpg", fileSize: 3 });
  assert.deepEqual([...(await c.downloadFile(f.filePath))], [1, 2, 3]);
  assert.equal(urls[1], `https://api.telegram.org/file/bot${TOKEN}/photos/file_1.jpg`);
});

test("downloadFile refuses unsafe paths and oversize files; errors never include the token", async () => {
  const fetchImpl = (async () => new Response(new Uint8Array(10))) as unknown as typeof fetch;
  const c = new TelegramClient({ botToken: TOKEN, fetchImpl });
  await assert.rejects(c.downloadFile("../secret"), TelegramError);
  await assert.rejects(c.downloadFile("photos/a.jpg", 5), (e: Error) => !e.message.includes(TOKEN));
  const failing = new TelegramClient({
    botToken: TOKEN,
    fetchImpl: (async () => new Response("no", { status: 404 })) as unknown as typeof fetch,
  });
  await assert.rejects(failing.downloadFile("photos/a.jpg"), (e: Error) => !e.message.includes(TOKEN));
});

test("setMyCommands posts the native command menu; invalid commands are refused before any request", async () => {
  const calls: Array<{ url: string; body: unknown }> = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify({ ok: true, result: true }));
  }) as typeof fetch;
  const c = new TelegramClient({ botToken: TOKEN, fetchImpl });
  await c.setMyCommands([{ command: "start", description: "Open LumiumX Factory" }]);
  assert.equal(calls.length, 1);
  assert.ok(calls[0]!.url.endsWith("/setMyCommands"));
  assert.deepEqual(calls[0]!.body, { commands: [{ command: "start", description: "Open LumiumX Factory" }] });
  await assert.rejects(c.setMyCommands([{ command: "Bad Name", description: "x" }]), /invalid command/);
  await assert.rejects(c.setMyCommands([{ command: "ok", description: "" }]), /invalid description/);
  assert.equal(calls.length, 1, "nothing sent for invalid input");
});
