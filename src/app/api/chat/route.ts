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
  isChatReadingMethod,
  isChatServiceMode,
  type ChatReadingMethod,
  type ChatServiceMode,
} from "@/lib/chat-service";
import {
  ChatTurnError,
  failChatTurn,
  finalizeChatTurnDelivery,
  markChatTurnDeliveryRecoverable,
  persistChatTurnCheckpoint,
  reserveChatTurn,
  waiveChatTurnCharge,
  type ReservedChatTurn,
} from "@/lib/chat-turn-service";
import {
  toPublicChatComplete,
  toPublicChatProgress,
  toPublicChatTrace,
} from "@/lib/chat-public-result";
import type {
  ChatErrorData,
  ChatInternalCompleteData,
  ChatProgressData,
  XuanjiChatMessage,
} from "@/lib/chat-ui-message";
import { getPalmImageUpload } from "@/lib/image-upload-store";
import { sanitizeCustomerAnswer } from "@/lib/product-identity";
import {
  assessSafetyRiskWithModeration,
  buildSafetyAssessmentText,
} from "@/lib/prompts";
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

function withClientCancellation(
  response: Response,
  abortController: AbortController,
) {
  if (!response.body) {
    return response;
  }

  const reader = response.body.getReader();
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();

        if (done) {
          controller.close();
          return;
        }

        controller.enqueue(value);
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel(reason) {
      if (!abortController.signal.aborted) {
        abortController.abort(reason);
      }

      try {
        await reader.cancel(reason);
      } catch {
        // The underlying response may already be closed by the client.
      }
    },
  });

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

async function streamLocalAnswer(
  writer: UIMessageStreamWriter<XuanjiChatMessage>,
  answer: string,
  signal: AbortSignal,
  onProgress?: (answer: string) => void,
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
    onProgress?.(streamedAnswer);
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

async function refreshSessionBalance(
  session: SessionPayload,
  state: {
    balanceAfter: number;
    quotaTotal?: number;
    quotaUsed?: number;
    quotaRemaining?: number;
  },
) {
  await createSession({
    userId: session.userId,
    emailMasked: session.emailMasked,
    tier: session.tier,
    starBalance: state.balanceAfter,
    chatQuota: state.quotaTotal,
    chatUsed: state.quotaUsed,
    profileLimit: session.profileLimit,
    quotaPeriodStart: session.quotaPeriodStart,
  });
}

function chatErrorResponse(error: unknown) {
  if (error instanceof ChatTurnError) {
    const publicMessages: Record<ChatTurnError["code"], string> = {
      CHAT_DATABASE_REQUIRED: "对话服务暂时不可用，本次没有扣除问答次数。",
      CHAT_DATABASE_UNAVAILABLE: "对话服务暂时不可用，本次没有扣除问答次数。",
      CHAT_SESSION_NOT_FOUND: "对话不存在或已被删除。",
      SESSION_BUSY: "该对话正在生成回答，请等待完成后再发送。",
      INSUFFICIENT_STARS: "星力不足，请充值或选择更轻量的服务后继续。",
      CHAT_QUOTA_EXCEEDED: "本月问答次数已用完，请升级会员后继续。",
      IDEMPOTENCY_MISMATCH: "请求内容已发生变化，请重新发送。",
      TURN_IN_PROGRESS: "这次请求仍在生成中，请稍候。",
      TURN_ALREADY_FAILED: "这次请求已结束并完成退款，请重新发送。",
      TURN_RESULT_UNAVAILABLE: "历史回答暂时无法恢复，请重新发送问题。",
      TURN_STATE_INVALID: "当前请求状态已变化，请重新发送。",
    };
    return Response.json(
      {
        ok: false,
        message: publicMessages[error.code],
        ...(error.balance === undefined ? {} : { balance: error.balance }),
        ...(error.quota ?? {}),
      },
      { status: error.status },
    );
  }

  if (process.env.NODE_ENV !== "production") {
    console.error("Chat request failed before streaming.", error);
  }

  return Response.json(
    { ok: false, message: "对话服务暂时不可用，本次没有扣除问答次数。" },
    { status: 503 },
  );
}

function createReplayResponse(data: ChatInternalCompleteData) {
  const publicData = toPublicChatComplete(data);
  const stream = createUIMessageStream<XuanjiChatMessage>({
    execute: ({ writer }) => {
      writer.write({ type: "start", messageId: generateId() });
      writer.write({
        type: "data-chatStart",
        data: {
          ...toPublicChatTrace(data),
          serviceMode: data.serviceMode,
          cost: data.cost,
          balanceAfter: data.balanceAfter,
          quotaTotal: data.quotaTotal,
          quotaUsed: data.quotaUsed,
          quotaRemaining: data.quotaRemaining,
          chatSessionId: data.chatSessionId,
          turnId: data.turnId,
          turnSequence: data.turnSequence,
          createdSession: false,
          replayed: true,
        },
      });
      writeAnswer(writer, publicData.answer);
      writer.write({ type: "data-chatComplete", data: publicData });
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

async function handleChatPost(request: Request) {
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
      { ok: false, message: "请求标识不正确，请重新发送。" },
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

  const cost = 0;
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

  if (reservation.kind === "replay") {
    await refreshSessionBalance(session, reservation.data);
    return createReplayResponse(reservation.data);
  }

  try {
    await refreshSessionBalance(session, reservation);
    const safetyPreflight = await assessSafetyRiskWithModeration(
      buildSafetyAssessmentText(
        question,
        reservation.history
          .filter((message) => message.role === "user")
          .map((message) => message.content),
      ),
    );

    if (request.signal.aborted) {
      const settlement = await failChatTurn({
        userId: session.userId,
        turnId: reservation.turnId,
        session,
        status: AiTurnStatus.CANCELLED,
        errorCode: "CLIENT_ABORTED_BEFORE_STREAM",
      });
      await refreshSessionBalance(session, settlement);
      return new Response(null, { status: 499 });
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
  } catch (error) {
    try {
      const settlement = await failChatTurn({
        userId: session.userId,
        turnId: reservation.turnId,
        session,
        status: request.signal.aborted ? AiTurnStatus.CANCELLED : AiTurnStatus.FAILED,
        errorCode: request.signal.aborted
          ? "CLIENT_ABORTED_BEFORE_STREAM"
          : "CHAT_PRE_STREAM_FAILED",
      });
      await refreshSessionBalance(session, settlement);
    } catch (settlementError) {
      console.error("Chat pre-stream settlement failed.", settlementError);
    }

    return request.signal.aborted
      ? new Response(null, { status: 499 })
      : chatErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    return await handleChatPost(request);
  } catch (error) {
    return chatErrorResponse(error);
  }
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
    method: input.prepared.intent,
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
      method: input.prepared.intent,
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
    method: input.prepared.intent,
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
  const responseAbortController = new AbortController();
  const chatSignal = AbortSignal.any([
    request.signal,
    responseAbortController.signal,
  ]);
  const stream = createUIMessageStream<XuanjiChatMessage>({
    execute: async ({ writer }) => {
      writer.write({ type: "start", messageId: generateId() });
      writer.write({
        type: "data-chatReserved",
        data: {
          serviceMode,
          cost,
          balanceAfter: reservation.balanceAfter,
          quotaTotal: reservation.quotaTotal,
          quotaUsed: reservation.quotaUsed,
          quotaRemaining: reservation.quotaRemaining,
          chatSessionId: reservation.sessionId,
          turnId: reservation.turnId,
          turnSequence: reservation.sequence,
          createdSession: reservation.createdSession,
        },
      });
      let progressSequence = 0;
      const writeProgress = (progress: Omit<ChatProgressData, "sequence">) => {
        writer.write({
          type: "data-chatProgress",
          data: { ...toPublicChatProgress(progress), sequence: progressSequence },
        });
        progressSequence += 1;
      };
      let prepared: PreparedAiChat;
      let effectiveCost = cost;
      let effectiveBalanceAfter = reservation.balanceAfter;
      let effectiveQuotaUsed = reservation.quotaUsed;
      let effectiveQuotaRemaining = reservation.quotaRemaining;

      try {
        prepared = await prepareAiChat({
          userId: session.userId,
          question,
          serviceMode,
          abortSignal: chatSignal,
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

        if (!prepared.promptRoute.allowPaid) {
          const reasonCode = prepared.answerShape === "identity_boundary"
            ? "IDENTITY_BOUNDARY"
            : prepared.answerShape === "missing_info"
              ? "MISSING_INPUT"
              : "SAFETY_BOUNDARY";
          const waived = await waiveChatTurnCharge({
            userId: session.userId,
            turnId: reservation.turnId,
            reasonCode,
          });
          effectiveBalanceAfter = waived.balanceAfter;
          effectiveQuotaUsed = waived.quotaUsed;
          effectiveQuotaRemaining = waived.quotaRemaining;
          effectiveCost = 0;
          await refreshSessionBalance(session, waived);
        }
      } catch (error) {
        const cancelled = chatSignal.aborted;
        let settlement = {
          balanceAfter: reservation.balanceAfter,
          quotaTotal: reservation.quotaTotal,
          quotaUsed: reservation.quotaUsed,
          quotaRemaining: reservation.quotaRemaining,
        };
        let settlementConfirmed = false;

        try {
          settlement = await failChatTurn({
            userId: session.userId,
            turnId: reservation.turnId,
            session,
            status: cancelled ? AiTurnStatus.CANCELLED : AiTurnStatus.FAILED,
            errorCode: cancelled ? "CLIENT_ABORTED_BEFORE_OUTPUT" : "CHAT_PREPARATION_FAILED",
          });
          await refreshSessionBalance(session, settlement);
          settlementConfirmed = true;
        } catch (settlementError) {
          console.error("Chat preparation settlement failed.", settlementError);
        }

        const refunded = settlementConfirmed && (
          settlement.balanceAfter > reservation.balanceAfter ||
          settlement.quotaUsed < reservation.quotaUsed
        );
        const preparationSettlementStatus = !settlementConfirmed
          ? "pending" as const
          : refunded
            ? "refunded" as const
            : "not_charged" as const;
        if (!cancelled) {
          writer.write({
            type: "data-chatError",
            data: {
              message: preparationSettlementStatus === "refunded"
                ? "本轮没有生成成功，已退回本次问答次数。你可以直接重试。"
                : preparationSettlementStatus === "not_charged"
                  ? "本轮没有生成成功，本次未计入问答次数。你可以直接重试。"
                  : "本轮没有生成成功，结算状态暂未确认。请稍后刷新对话记录后再重试。",
              balanceAfter: settlement.balanceAfter,
              quotaTotal: settlement.quotaTotal,
              quotaUsed: settlement.quotaUsed,
              quotaRemaining: settlement.quotaRemaining,
              turnId: reservation.turnId,
              refunded,
              settlementStatus: preparationSettlementStatus,
            },
          });
          writer.write({ type: "finish", finishReason: "error" });
        }

        if (process.env.NODE_ENV !== "production" && !chatSignal.aborted) {
          console.error("Chat preparation failed.", error);
        }
        return;
      }

      try {
        const publicTrace = toPublicChatTrace({
          intent: prepared.intent,
          steps: prepared.local.steps,
          toolCalls: prepared.local.toolCalls,
          answerShape: prepared.answerShape,
        });
        writer.write({
          type: "data-chatStart",
          data: {
            ...publicTrace,
            serviceMode,
            cost: effectiveCost,
            balanceAfter: effectiveBalanceAfter,
            quotaTotal: reservation.quotaTotal,
            quotaUsed: effectiveQuotaUsed,
            quotaRemaining: effectiveQuotaRemaining,
            chatSessionId: reservation.sessionId,
            turnId: reservation.turnId,
            turnSequence: reservation.sequence,
            createdSession: reservation.createdSession,
            replayed: false,
          },
        });

        if (publicTrace.showRitual) {
          await emitRitualProgress({
            prepared,
            mode: serviceMode,
            signal: chatSignal,
            write: writeProgress,
          });
        }

        writeProgress({
          step: "answer",
          status: "running",
          label: "生成顾问结论",
          detail: "正在形成判断、依据、风险和今天能做的下一步。",
          method: prepared.intent,
          serviceMode,
        });
      } catch (error) {
        const cancelled = chatSignal.aborted;
        let settlement = {
          balanceAfter: reservation.balanceAfter,
          quotaTotal: reservation.quotaTotal,
          quotaUsed: reservation.quotaUsed,
          quotaRemaining: reservation.quotaRemaining,
        };
        let settlementConfirmed = false;

        try {
          settlement = await failChatTurn({
            userId: session.userId,
            turnId: reservation.turnId,
            session,
            status: cancelled ? AiTurnStatus.CANCELLED : AiTurnStatus.FAILED,
            errorCode: cancelled ? "CLIENT_ABORTED_BEFORE_OUTPUT" : "CHAT_PROGRESS_FAILED",
          });
          await refreshSessionBalance(session, settlement);
          settlementConfirmed = true;
        } catch (settlementError) {
          console.error("Chat progress settlement failed.", settlementError);
        }

        if (!cancelled) {
          const alreadyWaived =
            effectiveBalanceAfter > reservation.balanceAfter ||
            effectiveQuotaUsed < reservation.quotaUsed;
          const refunded = settlementConfirmed && !alreadyWaived && (
            settlement.balanceAfter > reservation.balanceAfter ||
            settlement.quotaUsed < reservation.quotaUsed
          );
          const status = !settlementConfirmed
            ? "pending" as const
            : alreadyWaived
              ? "not_charged" as const
              : refunded
                ? "refunded" as const
                : "charged" as const;
          try {
            writer.write({
              type: "data-chatError",
              data: {
                message: status === "refunded"
                  ? "本轮没有生成成功，已退回本次问答次数。你可以直接重试。"
                  : status === "not_charged"
                    ? "本轮没有生成成功，本次未计入问答次数。你可以直接重试。"
                    : status === "pending"
                      ? "本轮没有生成成功，结算状态暂未确认。请稍后刷新对话记录。"
                      : "本轮没有生成成功，请刷新对话记录确认本轮结果。",
                balanceAfter: settlement.balanceAfter,
                quotaTotal: settlement.quotaTotal,
                quotaUsed: settlement.quotaUsed,
                quotaRemaining: settlement.quotaRemaining,
                turnId: reservation.turnId,
                refunded,
                settlementStatus: status,
              },
            });
            writer.write({ type: "finish", finishReason: "error" });
          } catch {
            // The turn is already settled even if the client stream is closed.
          }
        }

        if (process.env.NODE_ENV !== "production" && !cancelled) {
          console.error("Chat progress failed.", error);
        }
        return;
      }

      let checkpointData: ChatInternalCompleteData | null = null;
      let streamedAnswer = "";
      let refundPromise: Promise<
        Awaited<ReturnType<typeof failChatTurn>> & { settlementConfirmed: boolean }
      > | null = null;
      const refund = async (
        status: typeof AiTurnStatus.FAILED | typeof AiTurnStatus.CANCELLED,
        errorCode: string,
        failureDetails?: string[],
      ) => {
        refundPromise ??= failChatTurn({
          userId: session.userId,
          turnId: reservation.turnId,
          session,
          status,
          errorCode,
          failureDetails,
        })
          .then((data) => ({
            ...data,
            settlementConfirmed: true,
          }))
          .catch((settlementError) => {
            console.error("Chat turn settlement failed.", settlementError);
            return {
              balanceAfter: reservation.balanceAfter,
              quotaTotal: reservation.quotaTotal,
              quotaUsed: reservation.quotaUsed,
              quotaRemaining: reservation.quotaRemaining,
              settlementConfirmed: false,
            };
          });
        const state = await refundPromise;
        if (state.settlementConfirmed) {
          await refreshSessionBalance(session, state);
        }
        return state;
      };

      const settlementStatus = (state: Awaited<ReturnType<typeof refund>>) => {
        if (!state.settlementConfirmed) {
          return "pending" as const;
        }

        if (
          state.balanceAfter > reservation.balanceAfter ||
          state.quotaUsed < reservation.quotaUsed
        ) {
          return "refunded" as const;
        }

        if (
          effectiveBalanceAfter > reservation.balanceAfter ||
          effectiveQuotaUsed < reservation.quotaUsed
        ) {
          return "not_charged" as const;
        }

        return "charged" as const;
      };

      const settlementMessage = (
        failure: string,
        status: ReturnType<typeof settlementStatus>,
      ) => {
        if (status === "refunded") {
          return `${failure}，已退回本次问答次数，请稍后再试。`;
        }

        if (status === "not_charged") {
          return `${failure}，本轮未计入问答次数，请稍后再试。`;
        }

        if (status === "pending") {
          return `${failure}，结算状态暂未确认。请稍后刷新对话记录。`;
        }

        return `${failure}，请刷新对话记录确认本轮结果。`;
      };

      const writeStreamError = (data: ChatErrorData) => {
        writer.write({ type: "data-chatError", data });
      };
      const writeDeliveryPendingError = (data: ChatInternalCompleteData) => {
        writeStreamError({
          message: "回答已生成，但保存状态尚未确认。请刷新对话记录后再继续。",
          balanceAfter: data.balanceAfter,
          quotaTotal: data.quotaTotal,
          quotaUsed: data.quotaUsed,
          quotaRemaining: data.quotaRemaining,
          turnId: reservation.turnId,
          refunded: false,
          settlementStatus: "pending",
        });
        writer.write({ type: "finish", finishReason: "error" });
      };

      if (chatSignal.aborted) {
        await refund(AiTurnStatus.CANCELLED, "CLIENT_ABORTED_BEFORE_OUTPUT");
        return;
      }

      try {
        const generation = await generatePreparedAiChat({
          prepared,
          maxOutputTokens: serviceMode === "quick" ? 700 : serviceMode === "formal" ? 1100 : 1700,
          abortSignal: chatSignal,
        });

        if (chatSignal.aborted) {
          await refund(AiTurnStatus.CANCELLED, "CLIENT_ABORTED_BEFORE_OUTPUT");
          return;
        }

        const previewResult = buildPreparedAiChatResult(prepared, generation);
        const publicAnswer = sanitizeCustomerAnswer(
          previewResult.answer,
          previewResult.answerShape,
          question,
        );

        if (!previewResult.answer.trim()) {
          const settlement = await refund(AiTurnStatus.FAILED, "MODEL_EMPTY_RESPONSE");
          const status = settlementStatus(settlement);
          writeStreamError({
            message: settlementMessage("服务没有返回有效内容", status),
            balanceAfter: settlement.balanceAfter,
            quotaTotal: settlement.quotaTotal,
            quotaUsed: settlement.quotaUsed,
            quotaRemaining: settlement.quotaRemaining,
            turnId: reservation.turnId,
            refunded: status === "refunded",
            settlementStatus: status,
          });
          writer.write({ type: "finish", finishReason: "error" });
          return;
        }

        if (
          !previewResult.validation.ok ||
          (previewResult.answerShape !== "identity_boundary" && publicAnswer !== previewResult.answer)
        ) {
          if (process.env.NODE_ENV !== "production") {
            console.error(
              "Final chat answer rejected by validation.",
              JSON.stringify({
                intent: previewResult.intent,
                answerShape: previewResult.answerShape,
                errors: previewResult.validation.errors,
              }),
            );
          }
          const settlement = await refund(
            AiTurnStatus.FAILED,
            "FINAL_ANSWER_VALIDATION_FAILED",
            previewResult.validation.errors,
          );
          const status = settlementStatus(settlement);
          writeStreamError({
            message: settlementMessage("回答未通过最终质量校验", status),
            balanceAfter: settlement.balanceAfter,
            quotaTotal: settlement.quotaTotal,
            quotaUsed: settlement.quotaUsed,
            quotaRemaining: settlement.quotaRemaining,
            turnId: reservation.turnId,
            refunded: status === "refunded",
            settlementStatus: status,
          });
          writer.write({ type: "finish", finishReason: "error" });
          return;
        }

        if (previewResult.validation.degraded) {
          const waived = await waiveChatTurnCharge({
            userId: session.userId,
            turnId: reservation.turnId,
            reasonCode: "PROVIDER_FALLBACK",
          });
          effectiveBalanceAfter = waived.balanceAfter;
          effectiveQuotaUsed = waived.quotaUsed;
          effectiveQuotaRemaining = waived.quotaRemaining;
          effectiveCost = 0;
          await refreshSessionBalance(session, waived);
        }

        if (chatSignal.aborted) {
          await refund(AiTurnStatus.CANCELLED, "CLIENT_ABORTED_BEFORE_OUTPUT");
          return;
        }

        const persistedResult = { ...previewResult, answer: publicAnswer };
        checkpointData = await persistChatTurnCheckpoint({
          userId: session.userId,
          turnId: reservation.turnId,
          question,
          result: persistedResult,
          usage: buildPreparedAiChatUsage(prepared, persistedResult),
          intendedStatus: AiTurnStatus.COMPLETED,
        });
        await refreshSessionBalance(session, checkpointData);

        if (chatSignal.aborted) {
          await refund(AiTurnStatus.CANCELLED, "CLIENT_ABORTED_BEFORE_OUTPUT");
          return;
        }

        streamedAnswer = await streamLocalAnswer(
          writer,
          publicAnswer,
          chatSignal,
          (answer) => {
            streamedAnswer = answer;
          },
        );
        const streamedFullAnswer = streamedAnswer === publicAnswer;

        if (chatSignal.aborted && !streamedFullAnswer) {
          if (!streamedAnswer.trim()) {
            await refund(AiTurnStatus.CANCELLED, "CLIENT_ABORTED_BEFORE_OUTPUT");
            return;
          }

          try {
            const partialData = await finalizeChatTurnDelivery({
              userId: session.userId,
              turnId: reservation.turnId,
              answer: publicAnswer,
              status: AiTurnStatus.PARTIAL,
            });
            await refreshSessionBalance(session, partialData);
          } catch (settlementError) {
            console.error("Partial chat delivery settlement failed; durable checkpoint retained.", settlementError);
            try {
              checkpointData = await markChatTurnDeliveryRecoverable({
                userId: session.userId,
                turnId: reservation.turnId,
                status: AiTurnStatus.PARTIAL,
              });
            } catch (recoveryError) {
              console.error("Partial chat recovery marker failed.", recoveryError);
            }
          }
          return;
        }

        let completeData: ChatInternalCompleteData;
        try {
          completeData = await finalizeChatTurnDelivery({
            userId: session.userId,
            turnId: reservation.turnId,
            answer: publicAnswer,
            status: AiTurnStatus.COMPLETED,
          });
        } catch (settlementError) {
          console.error("Full chat delivery settlement failed; durable checkpoint retained.", settlementError);
          try {
            checkpointData = await markChatTurnDeliveryRecoverable({
              userId: session.userId,
              turnId: reservation.turnId,
              status: AiTurnStatus.COMPLETED,
            });
          } catch (recoveryError) {
            console.error("Full chat recovery marker failed.", recoveryError);
          }
          if (!chatSignal.aborted) {
            writeDeliveryPendingError(checkpointData);
          }
          return;
        }

        await refreshSessionBalance(session, completeData);

        if (!chatSignal.aborted) {
          writeProgress({
            step: "answer",
            status: "completed",
            label: "顾问结论已完成",
            detail: completeData.validation.degraded
              ? "回答已完成，并经过质量检查。"
              : "完整回答已经生成。",
            method: prepared.intent,
            serviceMode,
          });
          writer.write({ type: "data-chatComplete", data: toPublicChatComplete(completeData) });
          writer.write({ type: "finish", finishReason: "stop" });
        }
      } catch (error) {
        if (checkpointData && streamedAnswer.trim()) {
          let durableData = checkpointData;
          let deliveryFinalized = false;

          try {
            durableData = await finalizeChatTurnDelivery({
              userId: session.userId,
              turnId: reservation.turnId,
              answer: checkpointData.answer,
              status: AiTurnStatus.PARTIAL,
            });
            await refreshSessionBalance(session, durableData);
            deliveryFinalized = true;
          } catch (settlementError) {
            console.error("Interrupted chat delivery settlement failed; durable checkpoint retained.", settlementError);
            try {
              durableData = await markChatTurnDeliveryRecoverable({
                userId: session.userId,
                turnId: reservation.turnId,
                status: AiTurnStatus.PARTIAL,
              });
            } catch (recoveryError) {
              console.error("Interrupted chat recovery marker failed.", recoveryError);
            }
          }

          if (!chatSignal.aborted) {
            try {
              if (deliveryFinalized) {
                writer.write({ type: "data-chatComplete", data: toPublicChatComplete(durableData) });
                writer.write({ type: "finish", finishReason: "stop" });
              } else {
                writeDeliveryPendingError(durableData);
              }
            } catch {
              // The persisted checkpoint is recoverable from chat history or idempotent replay.
            }
          }

          if (process.env.NODE_ENV !== "production" && !chatSignal.aborted) {
            console.error("Chat delivery interrupted after durable output.", error);
          }
          return;
        }

        const failedState = chatSignal.aborted
          ? await refund(AiTurnStatus.CANCELLED, "CLIENT_ABORTED_BEFORE_OUTPUT")
          : await refund(AiTurnStatus.FAILED, "STRUCTURED_CHAT_GENERATION_FAILED");

        if (!chatSignal.aborted) {
          const status = settlementStatus(failedState);
          writeStreamError({
            message: settlementMessage("回答生成失败", status),
            balanceAfter: failedState.balanceAfter,
            quotaTotal: failedState.quotaTotal,
            quotaUsed: failedState.quotaUsed,
            quotaRemaining: failedState.quotaRemaining,
            turnId: reservation.turnId,
            refunded: status === "refunded",
            settlementStatus: status,
          });
          writer.write({ type: "finish", finishReason: "error" });
        }

        if (process.env.NODE_ENV !== "production" && !chatSignal.aborted) {
          console.error("Structured chat generation failed.", error);
        }
      }
    },
    onError(error) {
      if (process.env.NODE_ENV !== "production" && !chatSignal.aborted) {
        console.error("Chat UI stream failed.", error);
      }

      return "回答生成中断，请稍后再试。";
    },
  });

  const response = createUIMessageStreamResponse({
    stream,
    headers: {
      "Cache-Control": "private, no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });

  return withClientCancellation(response, responseAbortController);
}
