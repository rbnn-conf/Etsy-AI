/**
 * Minimal Telegram Bot API client — only the calls the product review
 * workflow needs. No dependencies; `fetch` / `FormData` / `Blob` are Node
 * globals (>=22.6). Injectable `fetchImpl` keeps tests offline.
 *
 * Every failure that leaves this module is a `TelegramError`. Callers that
 * treat notifications as best-effort (the notifier does) catch and log.
 */

const DEFAULT_BASE_URL = "https://api.telegram.org";

export class TelegramError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Non-2xx HTTP response, or a body with `ok: false`, from the Bot API. */
export class TelegramApiError extends TelegramError {
  readonly method: string;
  readonly status: number;
  readonly description: string;
  constructor(method: string, status: number, description: string) {
    super(`Telegram ${method} failed (HTTP ${status}): ${description}`);
    this.method = method;
    this.status = status;
    this.description = description;
  }
}

/** Transport failure — no HTTP status. */
export class TelegramNetworkError extends TelegramError {
  constructor(message: string, cause: unknown) {
    super(message);
    (this as { cause?: unknown }).cause = cause;
  }
}

export interface InlineKeyboardButton {
  readonly text: string;
  readonly callback_data: string;
}

export interface InlineKeyboardMarkup {
  readonly inline_keyboard: ReadonlyArray<ReadonlyArray<InlineKeyboardButton>>;
}

export interface SendMessageInput {
  readonly chatId: string;
  readonly text: string;
  readonly parseMode?: "HTML" | "MarkdownV2";
  readonly replyMarkup?: InlineKeyboardMarkup;
  readonly disableWebPagePreview?: boolean;
}

export interface SendDocumentInput {
  readonly chatId: string;
  readonly bytes: Uint8Array;
  readonly fileName: string;
  readonly caption?: string;
}

export interface SendPhotoInput {
  readonly chatId: string;
  readonly bytes: Uint8Array;
  readonly fileName: string;
  readonly caption?: string;
}

/**
 * The subset of the Bot API the review notifier uses. `TelegramClient`
 * implements it; tests substitute a recorder. Kept minimal on purpose.
 */
export interface TelegramSender {
  sendMessage(input: SendMessageInput): Promise<{ messageId: number }>;
  sendDocument(input: SendDocumentInput): Promise<{ messageId: number }>;
  sendPhoto(input: SendPhotoInput): Promise<{ messageId: number }>;
  sendPhotoAlbum(
    chatId: string,
    items: readonly MediaGroupItem[],
  ): Promise<void>;
}

export interface MediaGroupItem {
  readonly bytes: Uint8Array;
  readonly fileName: string;
  readonly caption?: string;
}

export interface TelegramUpdate {
  readonly update_id: number;
  readonly callback_query?: {
    readonly id: string;
    readonly from?: { readonly id: number; readonly username?: string };
    readonly message?: {
      readonly message_id: number;
      readonly chat?: { readonly id: number };
    };
    readonly data?: string;
  };
  readonly message?: {
    readonly message_id: number;
    readonly text?: string;
    readonly caption?: string;
    readonly media_group_id?: string;
    /** Sizes of one photo, smallest first (Bot API order). */
    readonly photo?: ReadonlyArray<TelegramPhotoSize>;
    readonly document?: TelegramDocument;
    readonly chat?: { readonly id: number };
    readonly from?: { readonly id: number; readonly username?: string };
  };
}

export interface TelegramPhotoSize {
  readonly file_id: string;
  readonly file_unique_id: string;
  readonly width: number;
  readonly height: number;
  readonly file_size?: number;
}

export interface TelegramDocument {
  readonly file_id: string;
  readonly file_unique_id: string;
  readonly file_name?: string;
  readonly mime_type?: string;
  readonly file_size?: number;
}

export interface TelegramClientOptions {
  readonly botToken: string;
  readonly fetchImpl?: typeof fetch;
  readonly baseUrl?: string;
}

interface TelegramApiResponse<T> {
  readonly ok: boolean;
  readonly result?: T;
  readonly description?: string;
}

function blobPart(bytes: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(out).set(bytes);
  return out;
}

export class TelegramClient implements TelegramSender {
  readonly #token: string;
  readonly #fetch: typeof fetch;
  readonly #base: string;

  constructor(options: TelegramClientOptions) {
    if (!options.botToken) {
      throw new TelegramError("TelegramClient requires a bot token.");
    }
    this.#token = options.botToken;
    this.#fetch = options.fetchImpl ?? fetch;
    this.#base = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  }

  async #call<T>(
    method: string,
    body: NonNullable<RequestInit["body"]>,
    headers?: Record<string, string>,
  ): Promise<T> {
    const url = `${this.#base}/bot${this.#token}/${method}`;
    const init: RequestInit = { method: "POST", body };
    if (headers) init.headers = headers;
    let res: Response;
    try {
      res = await this.#fetch(url, init);
    } catch (err) {
      throw new TelegramNetworkError(`Telegram ${method}: transport failure`, err);
    }
    let parsed: TelegramApiResponse<T> | undefined;
    const raw = await res.text();
    try {
      parsed = raw ? (JSON.parse(raw) as TelegramApiResponse<T>) : undefined;
    } catch {
      parsed = undefined;
    }
    if (!res.ok || !parsed?.ok) {
      throw new TelegramApiError(
        method,
        res.status,
        parsed?.description ?? raw.slice(0, 200) ?? "no body",
      );
    }
    return parsed.result as T;
  }

  #json(method: string, payload: Record<string, unknown>): Promise<unknown> {
    return this.#call(method, JSON.stringify(payload), {
      "content-type": "application/json",
    });
  }

  async sendMessage(input: SendMessageInput): Promise<{ messageId: number }> {
    const payload: Record<string, unknown> = {
      chat_id: input.chatId,
      text: input.text,
    };
    if (input.parseMode) payload["parse_mode"] = input.parseMode;
    if (input.replyMarkup) payload["reply_markup"] = input.replyMarkup;
    if (input.disableWebPagePreview !== undefined) {
      payload["disable_web_page_preview"] = input.disableWebPagePreview;
    }
    const result = (await this.#json("sendMessage", payload)) as {
      message_id: number;
    };
    return { messageId: result.message_id };
  }

  async sendDocument(input: SendDocumentInput): Promise<{ messageId: number }> {
    const fd = new FormData();
    fd.append("chat_id", input.chatId);
    if (input.caption) fd.append("caption", input.caption);
    fd.append("document", new Blob([blobPart(input.bytes)]), input.fileName);
    const result = (await this.#call("sendDocument", fd)) as {
      message_id: number;
    };
    return { messageId: result.message_id };
  }

  async sendPhoto(input: SendPhotoInput): Promise<{ messageId: number }> {
    const fd = new FormData();
    fd.append("chat_id", input.chatId);
    if (input.caption) fd.append("caption", input.caption);
    fd.append("photo", new Blob([blobPart(input.bytes)]), input.fileName);
    const result = (await this.#call("sendPhoto", fd)) as {
      message_id: number;
    };
    return { messageId: result.message_id };
  }

  /**
   * Send 2–10 photos as a single album. Telegram caps a media group at 10
   * and rejects a group of 1, so the caller chunks and hands singletons to
   * {@link sendPhoto}. Best-effort.
   */
  async sendPhotoAlbum(chatId: string, items: readonly MediaGroupItem[]): Promise<void> {
    if (items.length < 2) return;
    const fd = new FormData();
    fd.append("chat_id", chatId);
    const media = items.map((item, i) => {
      const attachName = `file${i}`;
      fd.append(attachName, new Blob([blobPart(item.bytes)]), item.fileName);
      const entry: Record<string, unknown> = {
        type: "photo",
        media: `attach://${attachName}`,
      };
      if (item.caption) entry["caption"] = item.caption;
      return entry;
    });
    fd.append("media", JSON.stringify(media));
    await this.#call("sendMediaGroup", fd);
  }

  /**
   * Register the bot's command list, shown natively when the user types "/".
   * Telegram limits: at most 100 commands; name 1-32 of [a-z0-9_]; description 1-256 chars.
   */
  async setMyCommands(commands: ReadonlyArray<{ readonly command: string; readonly description: string }>): Promise<void> {
    if (commands.length > 100) throw new Error("setMyCommands: at most 100 commands");
    for (const c of commands) {
      if (!/^[a-z0-9_]{1,32}$/.test(c.command)) throw new Error(`setMyCommands: invalid command "${c.command}"`);
      if (c.description.length < 1 || c.description.length > 256) throw new Error(`setMyCommands: invalid description for "${c.command}"`);
    }
    await this.#json("setMyCommands", { commands: commands.map((c) => ({ command: c.command, description: c.description })) });
  }

  async answerCallbackQuery(id: string, text?: string): Promise<void> {
    const payload: Record<string, unknown> = { callback_query_id: id };
    if (text) payload["text"] = text;
    await this.#json("answerCallbackQuery", payload);
  }

  /** Replace a message's text and keyboard (menu navigation in place). "Not modified" is ignored. */
  async editMessageText(
    chatId: string,
    messageId: number,
    text: string,
    replyMarkup?: InlineKeyboardMarkup,
  ): Promise<void> {
    const payload: Record<string, unknown> = { chat_id: chatId, message_id: messageId, text };
    if (replyMarkup) payload["reply_markup"] = replyMarkup;
    try {
      await this.#json("editMessageText", payload);
    } catch (err) {
      if (err instanceof TelegramApiError && err.status === 400 && /not modified/i.test(err.message)) return;
      throw err;
    }
  }

  async editMessageReplyMarkup(
    chatId: string,
    messageId: number,
    replyMarkup?: InlineKeyboardMarkup,
  ): Promise<void> {
    const payload: Record<string, unknown> = {
      chat_id: chatId,
      message_id: messageId,
    };
    if (replyMarkup) payload["reply_markup"] = replyMarkup;
    try {
      await this.#json("editMessageReplyMarkup", payload);
    } catch (err) {
      // "message is not modified" and races are not worth surfacing.
      if (err instanceof TelegramApiError && err.status === 400) return;
      throw err;
    }
  }

  async getUpdates(input: {
    offset?: number;
    timeoutSeconds?: number;
  }): Promise<readonly TelegramUpdate[]> {
    const payload: Record<string, unknown> = {
      timeout: input.timeoutSeconds ?? 0,
      allowed_updates: ["callback_query", "message"],
    };
    if (input.offset !== undefined) payload["offset"] = input.offset;
    const result = (await this.#json("getUpdates", payload)) as TelegramUpdate[];
    return result;
  }

  /** Resolve a `file_id` to a server-side path for {@link downloadFile}. */
  async getFile(fileId: string): Promise<{ filePath: string; fileSize?: number }> {
    const result = (await this.#json("getFile", { file_id: fileId })) as {
      file_path?: string;
      file_size?: number;
    };
    if (!result.file_path) {
      throw new TelegramError("Telegram getFile returned no file_path.");
    }
    const out: { filePath: string; fileSize?: number } = { filePath: result.file_path };
    if (result.file_size !== undefined) out.fileSize = result.file_size;
    return out;
  }

  /**
   * Download a file returned by {@link getFile}. The download URL embeds the
   * bot token, so errors never include it.
   */
  async downloadFile(filePath: string, maxBytes = 20_000_000): Promise<Uint8Array> {
    if (!/^[A-Za-z0-9._/-]+$/.test(filePath) || filePath.includes("..")) {
      throw new TelegramError("Refusing unsafe Telegram file path.");
    }
    let res: Response;
    try {
      res = await this.#fetch(`${this.#base}/file/bot${this.#token}/${filePath}`);
    } catch (err) {
      throw new TelegramNetworkError("Telegram file download: transport failure", err);
    }
    if (!res.ok) {
      throw new TelegramApiError("downloadFile", res.status, "download failed");
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength > maxBytes) {
      throw new TelegramError(`Telegram file exceeds ${maxBytes} bytes.`);
    }
    return bytes;
  }
}
