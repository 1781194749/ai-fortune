#!/usr/bin/env node

import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporaryDir = await mkdtemp(path.join(os.tmpdir(), "xuanji-chat-stream-check-"));
const outputFile = path.join(temporaryDir, "chat-stream-check.mjs");

const reactHookStub = String.raw`
  const states = [];
  let stateCursor = 0;

  export function __resetHooks() {
    states.length = 0;
    stateCursor = 0;
  }

  export function __getHookStates() {
    return states;
  }

  export function useState(initialValue) {
    const index = stateCursor;
    stateCursor += 1;
    states[index] = typeof initialValue === "function"
      ? initialValue()
      : initialValue;

    const setState = (value) => {
      states[index] = typeof value === "function"
        ? value(states[index])
        : value;
    };

    return [states[index], setState];
  }

  export function useRef(initialValue) {
    return { current: initialValue };
  }

  export function useCallback(callback) {
    return callback;
  }

  export function useEffect(effect) {
    effect();
  }
`;

const aliasPlugin = {
  name: "xuanji-chat-stream-check-alias",
  setup(builder) {
    builder.onResolve({ filter: /^@\// }, (args) => {
      const basePath = path.join(rootDir, "src", args.path.slice(2));
      const resolvedPath = [
        `${basePath}.ts`,
        `${basePath}.tsx`,
        `${basePath}.mjs`,
        `${basePath}.js`,
        path.join(basePath, "index.ts"),
        path.join(basePath, "index.tsx"),
        basePath,
      ].find((candidate) => existsSync(candidate)) ?? basePath;

      return { path: resolvedPath };
    });

    builder.onResolve({ filter: /^react$/ }, () => ({
      path: "react",
      namespace: "react-hook-stub",
    }));
    builder.onLoad({ filter: /.*/, namespace: "react-hook-stub" }, () => ({
      contents: reactHookStub,
      loader: "js",
    }));
  },
};

const testSource = String.raw`
  import assert from "node:assert/strict";
  import { __getHookStates, __resetHooks } from "react";
  import { useXuanjiChat } from "@/app/chat/use-xuanji-chat";
  import { parseXuanjiChatEventStream } from "@/app/chat/xuanji-chat-stream";

  const encoder = new TextEncoder();
  const results = [];

  const completeData = {
    answer: "先确认目标，再完成第一步。",
    question: "下一步怎么做？",
    serviceMode: "quick",
    chatSessionId: "session-stream-check",
    turnId: "turn-stream-check",
    turnStatus: "COMPLETED",
    cost: 1,
    turnSequence: 1,
    counted: true,
    replayed: false,
    balanceAfter: 9,
    quotaTotal: 10,
    quotaUsed: 1,
    quotaRemaining: 9,
    method: "general",
    showRitual: false,
    steps: [{ label: "形成建议", detail: "给出具体下一步。" }],
    evidence: [{ label: "现实条件", status: "completed", summary: "目标已经明确。" }],
  };

  const errorData = {
    message: "本次回答未完成，星力已退回。",
    balanceAfter: 10,
    quotaTotal: 10,
    quotaUsed: 0,
    quotaRemaining: 10,
    refunded: true,
    settlementStatus: "refunded",
  };

  function event(value) {
    return "data: " + JSON.stringify(value);
  }

  function createBody(parts, options = {}) {
    const { close = true, onCancel } = options;

    return new ReadableStream({
      start(controller) {
        for (const part of parts) {
          controller.enqueue(encoder.encode(part));
        }
        if (close) {
          controller.close();
        }
      },
      cancel(reason) {
        onCancel?.(reason);
      },
    });
  }

  function createEventBody(events, options = {}) {
    const separator = options.separator ?? "\n\n";
    const body = events.map(event).join(separator) + separator;
    return createBody([body], options);
  }

  function createStreamResponse(body) {
    return new Response(body, {
      status: 200,
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "x-vercel-ai-ui-message-stream": "v1",
      },
    });
  }

  function normalEvents(separator = "stop") {
    return [
      { type: "start", messageId: "assistant-stream-check" },
      { type: "text-start", id: "text-stream-check" },
      { type: "text-delta", id: "text-stream-check", delta: "先确认目标" },
      { type: "text-delta", id: "text-stream-check", delta: "，再完成第一步。" },
      { type: "text-end", id: "text-stream-check" },
      { type: "data-chatComplete", data: completeData },
      { type: "finish", finishReason: separator },
    ];
  }

  async function check(name, run) {
    await run();
    results.push(name);
  }

  async function withChatResponse(responseFactory, run) {
    __resetHooks();
    const originalFetch = globalThis.fetch;
    let requestSignal;
    const dataParts = [];
    const errors = [];
    const finishes = [];

    globalThis.fetch = async (_input, init) => {
      requestSignal = init?.signal;
      return responseFactory();
    };

    const chat = useXuanjiChat({
      throttleMs: 0,
      onData: (part) => dataParts.push(part),
      onError: (error) => errors.push(error),
      onFinish: (result) => finishes.push(result),
    });

    try {
      await run({
        chat,
        dataParts,
        errors,
        finishes,
        getRequestSignal: () => requestSignal,
        getStates: () => __getHookStates(),
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  }

  await check("正常 complete 闭环", async () => {
    await withChatResponse(
      () => createStreamResponse(createEventBody(normalEvents())),
      async ({ chat, dataParts, errors, finishes, getRequestSignal, getStates }) => {
        await chat.sendMessage({ text: "下一步怎么做？" });

        const [messages, status, error] = getStates();
        assert.equal(status, "ready");
        assert.equal(error, undefined);
        assert.equal(getRequestSignal()?.aborted, false);
        assert.equal(errors.length, 0);
        assert.equal(dataParts.at(-1)?.type, "data-chatComplete");
        assert.equal(finishes.length, 1);
        assert.equal(finishes[0].isAbort, false);
        assert.equal(finishes[0].isError, false);
        assert.equal(messages.length, 2);
        assert.equal(messages[1].id, "assistant-stream-check");
        assert.equal(messages[1].parts[0].type, "text");
        assert.equal(messages[1].parts[0].text, "先确认目标，再完成第一步。");
        assert.equal(messages[1].parts[0].state, "done");
        assert.equal(messages[1].parts[1].type, "data-chatComplete");
      },
    );
  });

  await check("data-chatError 作为完整错误结局", async () => {
    const events = [
      { type: "start", messageId: "assistant-error-check" },
      { type: "data-chatError", data: errorData },
      { type: "finish", finishReason: "stop" },
    ];

    await withChatResponse(
      () => createStreamResponse(createEventBody(events)),
      async ({ chat, dataParts, errors, finishes, getStates }) => {
        await chat.sendMessage({ text: "请继续" });

        const [, status, error] = getStates();
        assert.equal(status, "ready");
        assert.equal(error, undefined);
        assert.equal(errors.length, 0);
        assert.equal(dataParts.at(-1)?.type, "data-chatError");
        assert.equal(finishes.length, 1);
        assert.equal(finishes[0].isAbort, false);
        assert.equal(finishes[0].isError, true);
      },
    );
  });

  await check("空流被拒绝", async () => {
    await withChatResponse(
      () => createStreamResponse(createBody([])),
      async ({ chat, errors, finishes, getRequestSignal, getStates }) => {
        await assert.rejects(
          chat.sendMessage({ text: "空流" }),
          /回答传输中断，服务器保存状态需要重新确认。/,
        );
        assert.equal(getRequestSignal()?.aborted, true);
        assert.equal(getStates()[1], "error");
        assert.equal(errors.length, 1);
        assert.equal(finishes.length, 0);
      },
    );
  });

  await check("HTML 200 被拒绝并取消请求", async () => {
    await withChatResponse(
      () => new Response("<html><body>upstream error</body></html>", {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
      async ({ chat, getRequestSignal }) => {
        await assert.rejects(
          chat.sendMessage({ text: "HTML 200" }),
          /回答服务返回了不正确的流格式，请稍后重试。/,
        );
        assert.equal(getRequestSignal()?.aborted, true);
      },
    );
  });

  await check("截断文本缺少 text-end 被拒绝", async () => {
    const events = normalEvents().filter((item) => item.type !== "text-end");

    await withChatResponse(
      () => createStreamResponse(createEventBody(events)),
      async ({ chat, getRequestSignal, getStates }) => {
        await assert.rejects(
          chat.sendMessage({ text: "截断文本" }),
          /回答传输中断，服务器保存状态需要重新确认。/,
        );
        assert.equal(getRequestSignal()?.aborted, true);
        const messages = getStates()[0];
        assert.equal(messages[1].parts[0].state, "done");
      },
    );
  });

  await check("缺少 finish 被拒绝", async () => {
    const events = normalEvents().filter((item) => item.type !== "finish");

    await withChatResponse(
      () => createStreamResponse(createEventBody(events)),
      async ({ chat, getRequestSignal }) => {
        await assert.rejects(
          chat.sendMessage({ text: "缺少 finish" }),
          /回答传输中断，服务器保存状态需要重新确认。/,
        );
        assert.equal(getRequestSignal()?.aborted, true);
      },
    );
  });

  await check("裸 CR 事件分隔可解析", async () => {
    const stream = createEventBody(normalEvents(), { separator: "\r\r" });
    const chunks = [];

    for await (const chunk of parseXuanjiChatEventStream(stream)) {
      chunks.push(chunk);
    }

    assert.deepEqual(
      chunks.map((chunk) => chunk.type),
      normalEvents().map((chunk) => chunk.type),
    );
  });

  await check("截断 JSON 被拒绝并取消请求", async () => {
    const body = createBody(["data: {\"type\":\"text-delta\"\n\n"]);

    await withChatResponse(
      () => createStreamResponse(body),
      async ({ chat, getRequestSignal }) => {
        await assert.rejects(
          chat.sendMessage({ text: "截断 JSON" }),
          /回答流格式不正确，请稍后重试。/,
        );
        assert.equal(getRequestSignal()?.aborted, true);
      },
    );
  });

  await check("异常后 reader 与 request 均被取消", async () => {
    let readerCancelCount = 0;
    const invalidOrder = [
      { type: "start", messageId: "assistant-cancel-check" },
      { type: "text-delta", id: "missing-text-start", delta: "无效顺序" },
    ];

    await withChatResponse(
      () => createStreamResponse(createEventBody(invalidOrder, {
        close: false,
        onCancel: () => {
          readerCancelCount += 1;
        },
      })),
      async ({ chat, getRequestSignal }) => {
        await assert.rejects(
          chat.sendMessage({ text: "触发取消" }),
          /回答流顺序不正确，请稍后重试。/,
        );
        assert.equal(readerCancelCount, 1);
        assert.equal(getRequestSignal()?.aborted, true);
      },
    );
  });

  console.log("玄机聊天流协议回归通过：" + results.length + " 项");
  for (const result of results) {
    console.log("[OK] " + result);
  }
`;

try {
  await build({
    stdin: {
      contents: testSource,
      loader: "ts",
      resolveDir: rootDir,
      sourcefile: "xuanji-chat-stream-regression-entry.ts",
    },
    outfile: outputFile,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    plugins: [aliasPlugin],
    logLevel: "silent",
  });

  await import(`${pathToFileURL(outputFile).href}?v=${Date.now()}`);
} finally {
  await rm(temporaryDir, { recursive: true, force: true });
}
