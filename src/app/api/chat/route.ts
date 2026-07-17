import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
  type UIMessageStreamWriter,
} from "ai";
import { AiTurnStatus } from "@/generated/prisma/enums";
import {
  buildPreparedAiChatResult,
  buildPreparedAiChatUsage,
  generatePreparedAiChat,
  prepareAiChat,
  type PreparedAiChat,
} from "@/lib/ai-orchestrator";
import {
  getChatServiceMode,
  isChatReadingMethod,
  isChatServiceMode,
  type ChatReadingMethod,
  type ChatServiceMode,
} from "@/lib/chat-service";
import {
  ChatTurnError,
  completeChatTurn,
  failChatTurn,
  reserveChatTurn,
  waiveChatTurnCharge,
  type ReservedChatTurn,
} from "@/lib/chat-turn-service";
import type {
  ChatCompleteData,
  ChatErrorData,
  ChatProgressData,
  XuanjiChatMessage,
} from "@/lib/chat-ui-message";
import { getPalmImageUpload } from "@/lib/image-upload-store";
import { assessSafetyRiskWithModeration } from "@/lib/prompts";
import { createSession, getSession, type SessionPayload } from "@/lib/session";

const chineseSegmenter = new Intl.Segmenter("zh-CN", { granularity: "word" });
const clientRequestIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function latestUserText(messages: XuanjiChatMessage[] | undefined) {
  const message = messages?.findLast((item) => item.role === "user");

  if (!message) {
    return "";
  }

  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("")
    .trim();
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function streamLocalAnswer(
  writer: UIMessageStreamWriter<XuanjiChatMessage>,
  answer: string,
  signal: AbortSignal,
) {
  const textId = generateId();
  let streamedAnswer = "";
  writer.write({ type: "text-start", id: textId });

  for (const item of chineseSegmenter.segment(answer)) {
    if (signal.aborted) {
      break;
    }

    streamedAnswer += item.segment;
    writer.write({ type: "text-delta", id: textId, delta: item.segment });
    await delay(14);
  }

  writer.write({ type: "text-end", id: textId });
  return streamedAnswer;
}

function writeAnswer(
  writer: UIMessageStreamWriter<XuanjiChatMessage>,
  answer: string,
) {
  const textId = generateId();
  writer.write({ type: "text-start", id: textId });
  writer.write({ type: "text-delta", id: textId, delta: answer });
  writer.write({ type: "text-end", id: textId });
}

async function refreshSessionBalance(session: SessionPayload, starBalance: number) {
  await createSession({
    userId: session.userId,
    emailMasked: session.emailMasked,
    tier: session.tier,
    starBalance,
  });
}

function chatErrorResponse(error: unknown) {
  if (error instanceof ChatTurnError) {
    return Response.json(
      {
        ok: false,
        code: error.code,
        message: error.message,
        ...(error.balance === undefined ? {} : { balance: error.balance }),
      },
      { status: error.status },
    );
  }

  if (process.env.NODE_ENV !== "production") {
    console.error("Chat request failed before streaming.", error);
  }

  return Response.json(
    { ok: false, code: "CHAT_REQUEST_FAILED", message: "对话服务暂时不可用，本次没有扣除星力。" },
    { status: 503 },
  );
}

function createReplayResponse(data: ChatCompleteData) {
  const qualityTrace = data.qualityTrace ?? {
    intent: data.intent,
    toolNames: data.toolCalls.map((tool) => tool.name),
    contextSummary: data.contextSummary,
    answerShape: data.answerShape,
  };
  const stream = createUIMessageStream<XuanjiChatMessage>({
    execute: ({ writer }) => {
      writer.write({ type: "start", messageId: generateId() });
      writer.write({
        type: "data-chatStart",
        data: {
          intent: data.intent,
          steps: data.steps,
          toolCalls: data.toolCalls,
          contextSummary: data.contextSummary,
          answerShape: data.answerShape,
          qualityTrace,
          serviceMode: data.serviceMode,
          cost: data.cost,
          balanceAfter: data.balanceAfter,
          chatSessionId: data.chatSessionId,
          turnId: data.turnId,
          turnSequence: data.turnSequence,
          createdSession: false,
          replayed: true,
        },
      });
      writeAnswer(writer, data.answer);
      writer.write({ type: "data-chatComplete", data });
      writer.write({ type: "finish", finishReason: "stop" });
    },
  });

  return createUIMessageStreamResponse({
    stream,
    headers: {
      "Cache-Control": "private, no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function POST(request: Request) {
  const session = await getSession();

  if (!session) {
    return Response.json({ ok: false, message: "请先登录。" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        messages?: XuanjiChatMessage[];
        sessionId?: string;
        clientRequestId?: string;
        question?: string;
        palmImageId?: string;
        serviceMode?: ChatServiceMode;
        readingMethod?: ChatReadingMethod;
      }
    | null;
  const question = body?.question?.trim() || latestUserText(body?.messages);
  const sessionId = body?.sessionId?.trim() ?? "";
  const clientRequestId = body?.clientRequestId?.trim() ?? "";
  const palmImageId = body?.palmImageId?.trim() ?? "";
  const serviceMode = isChatServiceMode(body?.serviceMode) ? body.serviceMode : "quick";
  const readingMethod = isChatReadingMethod(body?.readingMethod) ? body.readingMethod : undefined;

  if (question.length < 2) {
    return Response.json(
      { ok: false, message: "请先输入你想咨询的问题。" },
      { status: 400 },
    );
  }

  if (question.length > 800) {
    return Response.json(
      { ok: false, message: "问题太长了，请压缩到 800 字以内。" },
      { status: 400 },
    );
  }

  if (sessionId.length > 100) {
    return Response.json(
      { ok: false, message: "会话标识不正确，请重新打开对话。" },
      { status: 400 },
    );
  }

  if (!clientRequestIdPattern.test(clientRequestId)) {
    return Response.json(
      { ok: false, code: "INVALID_CLIENT_REQUEST_ID", message: "请求标识不正确，请重新发送。" },
      { status: 400 },
    );
  }

  const palmImage = palmImageId ? await getPalmImageUpload(palmImageId) : null;

  if (palmImageId && (!palmImage || palmImage.userId !== session.userId || palmImage.deletedAt)) {
    return Response.json(
      { ok: false, message: "手相图片不存在或不可用，请重新上传。" },
      { status: 404 },
    );
  }

  const safetyPreflight = await assessSafetyRiskWithModeration(question);
  const cost = safetyPreflight.notEligibleForPaid ? 0 : getChatServiceMode(serviceMode).cost;
  let reservation: Awaited<ReturnType<typeof reserveChatTurn>>;

  try {
    reservation = await reserveChatTurn({
      session,
      sessionId: sessionId || undefined,
      clientRequestId,
      question,
      palmImageId: palmImageId || undefined,
      serviceMode,
      readingMethod,
      costStars: cost,
    });
  } catch (error) {
    return chatErrorResponse(error);
  }

  await refreshSessionBalance(session, reservation.kind === "replay"
    ? reservation.data.balanceAfter
    : reservation.balanceAfter);

  if (reservation.kind === "replay") {
    return createReplayResponse(reservation.data);
  }

  return createChatStreamResponse({
    request,
    session,
    reservation,
    palmImage,
    serviceMode,
    question,
    cost,
    safetyPreflight,
    readingMethod,
  });
}

async function emitRitualProgress(input: {
  prepared: PreparedAiChat;
  mode: ChatServiceMode;
  signal: AbortSignal;
  write: (progress: Omit<ChatProgressData, "sequence">) => void;
}) {
  const items = input.prepared.ritualItems;
  const pause = input.mode === "quick" ? 80 : input.mode === "formal" ? 420 : 540;

  input.write({
    step: "ritual",
    status: "running",
    label: input.prepared.intent === "tarot"
      ? "逐张翻牌"
      : input.prepared.intent === "bagua"
        ? "展开卦象"
        : input.prepared.intent === "bazi"
          ? "展开命盘"
          : "凝练核心问题",
    detail: "以下内容来自本轮刚刚完成的真实推演。",
    intent: input.prepared.intent,
    serviceMode: input.mode,
  });

  for (const ritualItem of items) {
    if (input.signal.aborted) {
      return;
    }

    input.write({
      step: "ritual",
      status: "running",
      label: "推演结果正在显现",
      detail: "每一项都来自本轮工具结果。",
      intent: input.prepared.intent,
      serviceMode: input.mode,
      ritualItem,
    });
    await delay(pause);
  }

  input.write({
    step: "ritual",
    status: "completed",
    label: "推演结果已显现",
    detail: "现在开始结合问题与历史信息生成解释。",
    intent: input.prepared.intent,
    serviceMode: input.mode,
  });
}

function createChatStreamResponse(input: {
  request: Request;
  session: SessionPayload;
  reservation: ReservedChatTurn;
  palmImage: Awaited<ReturnType<typeof getPalmImageUpload>>;
  serviceMode: ChatServiceMode;
  question: string;
  cost: number;
  safetyPreflight: Awaited<ReturnType<typeof assessSafetyRiskWithModeration>>;
  readingMethod?: ChatReadingMethod;
}) {
  const {
    request,
    session,
    reservation,
    palmImage,
    serviceMode,
    question,
    cost,
    safetyPreflight,
    readingMethod,
  } = input;
  const stream = createUIMessageStream<XuanjiChatMessage>({
    execute: async ({ writer }) => {
      writer.write({ type: "start", messageId: generateId() });
      let progressSequence = 0;
      const writeProgress = (progress: Omit<ChatProgressData, "sequence">) => {
        writer.write({
          type: "data-chatProgress",
          data: { ...progress, sequence: progressSequence },
        });
        progressSequence += 1;
      };
      let prepared: PreparedAiChat;
      let effectiveCost = cost;
      let effectiveBalanceAfter = reservation.balanceAfter;

      try {
        prepared = await prepareAiChat({
          userId: session.userId,
          question,
          serviceMode,
          readingSeed: reservation.turnId,
          history: reservation.history,
          palmImage: palmImage
            ? {
                id: palmImage.id,
                qiniuKey: palmImage.qiniuKey,
                url: palmImage.url,
                contentType: palmImage.contentType,
                sizeBytes: palmImage.sizeBytes,
              }
            : undefined,
          safetyAssessment: safetyPreflight,
          requestedMethod: readingMethod,
          methodSource: readingMethod ? "page_entry" : undefined,
        }, writeProgress);

        if (!prepared.promptRoute.allowPaid && effectiveCost > 0) {
          const reasonCode = prepared.answerShape === "identity_boundary"
            ? "IDENTITY_BOUNDARY"
            : prepared.answerShape === "missing_info"
              ? "MISSING_INPUT"
              : "SAFETY_BOUNDARY";
          effectiveBalanceAfter = await waiveChatTurnCharge({
            userId: session.userId,
            turnId: reservation.turnId,
            reasonCode,
          });
          effectiveCost = 0;
          await refreshSessionBalance(session, effectiveBalanceAfter);
        }
      } catch (error) {
        const balanceAfter = await failChatTurn({
          userId: session.userId,
          turnId: reservation.turnId,
          session,
          status: AiTurnStatus.FAILED,
          errorCode: "CHAT_PREPARATION_FAILED",
        }).catch(() => reservation.balanceAfter);
        await refreshSessionBalance(session, balanceAfter);
        writer.write({
          type: "data-chatError",
          data: {
            message: "本轮没有生成成功，已退回本次星力。你可以直接重试或改用轻量回答。",
            balanceAfter,
            code: "CHAT_PREPARATION_FAILED",
            turnId: reservation.turnId,
            refunded: balanceAfter > reservation.balanceAfter,
          },
        });
        writer.write({ type: "finish", finishReason: "error" });

        if (process.env.NODE_ENV !== "production" && !request.signal.aborted) {
          console.error("Chat preparation failed.", error);
        }
        return;
      }

      await emitRitualProgress({
        prepared,
        mode: serviceMode,
        signal: request.signal,
        write: writeProgress,
      });

      const startQualityTrace = {
        intent: prepared.intent,
        toolNames: prepared.local.toolCalls.map((tool) => tool.name),
        contextSummary: prepared.compiledContext,
        answerShape: prepared.answerShape,
      };

      writeProgress({
        step: "answer",
        status: "running",
        label: "生成顾问结论",
        detail: "正在形成判断、依据、风险和今天能做的下一步。",
        intent: prepared.intent,
        serviceMode,
      });
      writer.write({
        type: "data-chatStart",
        data: {
          intent: prepared.intent,
          steps: prepared.local.steps,
          toolCalls: prepared.local.toolCalls,
          contextSummary: prepared.compiledContext,
          answerShape: prepared.answerShape,
          qualityTrace: startQualityTrace,
          serviceMode,
          cost: effectiveCost,
          balanceAfter: effectiveBalanceAfter,
          chatSessionId: reservation.sessionId,
          turnId: reservation.turnId,
          turnSequence: reservation.sequence,
          createdSession: reservation.createdSession,
          replayed: false,
        },
      });

      type Settlement =
        | { kind: "complete"; data: ChatCompleteData }
        | { kind: "refund"; balanceAfter: number };
      let settlement: Promise<Settlement> | null = null;

      const complete = async (
        status: typeof AiTurnStatus.COMPLETED | typeof AiTurnStatus.PARTIAL,
        generation: Parameters<typeof buildPreparedAiChatResult>[1],
      ) => {
        settlement ??= (() => {
          const result = buildPreparedAiChatResult(prepared, generation);
          return completeChatTurn({
            userId: session.userId,
            turnId: reservation.turnId,
            question,
            result,
            usage: buildPreparedAiChatUsage(prepared, result),
            status,
          }).then((data) => ({ kind: "complete" as const, data }));
        })();
        const settled = await settlement;
        return settled.kind === "complete" ? settled.data : null;
      };

      const refund = async (
        status: typeof AiTurnStatus.FAILED | typeof AiTurnStatus.CANCELLED,
        errorCode: string,
      ) => {
        settlement ??= failChatTurn({
          userId: session.userId,
          turnId: reservation.turnId,
          session,
          status,
          errorCode,
        }).then((balanceAfter) => ({ kind: "refund" as const, balanceAfter }));
        const settled = await settlement;
        const balanceAfter = settled.kind === "refund" ? settled.balanceAfter : settled.data.balanceAfter;
        await refreshSessionBalance(session, balanceAfter);
        return balanceAfter;
      };

      const writeStreamError = (data: ChatErrorData) => {
        writer.write({ type: "data-chatError", data });
      };

      if (request.signal.aborted) {
        await refund(AiTurnStatus.CANCELLED, "CLIENT_ABORTED_BEFORE_OUTPUT");
        return;
      }

      try {
        const generation = await generatePreparedAiChat({
          prepared,
          maxOutputTokens: serviceMode === "quick" ? 700 : serviceMode === "formal" ? 1100 : 1700,
          abortSignal: request.signal,
        });

        if (request.signal.aborted) {
          await refund(AiTurnStatus.CANCELLED, "CLIENT_ABORTED_BEFORE_OUTPUT");
          return;
        }

        const previewResult = buildPreparedAiChatResult(prepared, generation);

        if (!previewResult.answer.trim()) {
          const balanceAfter = await refund(AiTurnStatus.FAILED, "MODEL_EMPTY_RESPONSE");
          writeStreamError({
            message: "模型没有返回有效内容，已退回本次星力，请稍后再试。",
            balanceAfter,
            code: "MODEL_EMPTY_RESPONSE",
            turnId: reservation.turnId,
            refunded: balanceAfter > reservation.balanceAfter,
          });
          writer.write({ type: "finish", finishReason: "error" });
          return;
        }

        const completeData = await complete(AiTurnStatus.COMPLETED, generation);

        if (!completeData) {
          return;
        }

        await refreshSessionBalance(session, completeData.balanceAfter);
        await streamLocalAnswer(writer, completeData.answer, request.signal);

        if (!request.signal.aborted) {
          writeProgress({
            step: "answer",
            status: "completed",
            label: "顾问结论已完成",
            detail: completeData.validation.degraded
              ? "已使用确定性安全降级生成结论卡。"
              : "结论卡与继续追问方向已经生成。",
            intent: prepared.intent,
            serviceMode,
          });
          writer.write({ type: "data-chatComplete", data: completeData });
          writer.write({ type: "finish", finishReason: "stop" });
        }
      } catch (error) {
        const balanceAfter = request.signal.aborted
          ? await refund(AiTurnStatus.CANCELLED, "CLIENT_ABORTED_BEFORE_OUTPUT")
          : await refund(AiTurnStatus.FAILED, "STRUCTURED_CHAT_GENERATION_FAILED");

        if (!request.signal.aborted) {
          writeStreamError({
            message: "回答生成失败，已退回本次星力，请稍后再试。",
            balanceAfter,
            code: "STRUCTURED_CHAT_GENERATION_FAILED",
            turnId: reservation.turnId,
            refunded: balanceAfter > reservation.balanceAfter,
          });
          writer.write({ type: "finish", finishReason: "error" });
        }

        if (process.env.NODE_ENV !== "production" && !request.signal.aborted) {
          console.error("Structured chat generation failed.", error);
        }
      }
    },
    onError(error) {
      if (process.env.NODE_ENV !== "production" && !request.signal.aborted) {
        console.error("Chat UI stream failed.", error);
      }

      return "回答生成中断，请稍后再试。";
    },
  });

  return createUIMessageStreamResponse({
    stream,
    headers: {
      "Cache-Control": "private, no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
