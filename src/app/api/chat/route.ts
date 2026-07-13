import { getResolvedStarCost, checkEntitlement } from "@/lib/entitlements";
import {
  prepareAiChat,
  runPreparedAiChatStream,
  type AiChatResult,
} from "@/lib/ai-orchestrator";
import { saveChatTurn } from "@/lib/ai-session-store";
import { getPalmImageUpload } from "@/lib/image-upload-store";
import { spendStars } from "@/lib/mock-payment-store";
import { createSession, getSession } from "@/lib/session";

type ChatStreamEvent =
  | {
      type: "start";
      data: {
        intent: AiChatResult["intent"];
        steps: AiChatResult["steps"];
        toolCalls: AiChatResult["toolCalls"];
        cost: number;
        balanceAfter: number;
      };
    }
  | { type: "delta"; delta: string }
  | { type: "replace"; answer: string }
  | {
      type: "complete";
      data: { ok: true; cost: number; balanceAfter: number; chatSessionId: string } & AiChatResult;
    }
  | { type: "error"; message: string; balanceAfter: number };

const encoder = new TextEncoder();

function encodeStreamEvent(event: ChatStreamEvent) {
  return encoder.encode(`${JSON.stringify(event)}\n`);
}

export async function POST(request: Request) {
  const session = await getSession();

  if (!session) {
    return Response.json({ ok: false, message: "请先登录。" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { question?: string; palmImageId?: string }
    | null;
  const question = body?.question?.trim() ?? "";
  const palmImageId = body?.palmImageId?.trim() ?? "";

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

  const palmImage = palmImageId ? await getPalmImageUpload(palmImageId) : null;

  if (palmImageId && (!palmImage || palmImage.userId !== session.userId || palmImage.deletedAt)) {
    return Response.json(
      { ok: false, message: "手相图片不存在或不可用，请重新上传。" },
      { status: 404 },
    );
  }

  const entitlement = checkEntitlement(session, "chat_basic");

  if (!entitlement.ok) {
    return Response.json(
      {
        ok: false,
        message: `星力不足，需要 ${entitlement.requiredStars} 星力，当前 ${entitlement.balance} 星力。`,
        requiredStars: entitlement.requiredStars,
        balance: entitlement.balance,
      },
      { status: 402 },
    );
  }

  const prepared = await prepareAiChat({
    userId: session.userId,
    question,
    palmImage: palmImage
      ? {
          id: palmImage.id,
          qiniuKey: palmImage.qiniuKey,
          url: palmImage.url,
          contentType: palmImage.contentType,
          sizeBytes: palmImage.sizeBytes,
        }
      : undefined,
  });
  const cost = getResolvedStarCost("chat_basic");
  const spendResult = await spendStars(session, {
    featureCode: "chat_basic",
    amount: cost,
    reason: `AI 命理对话消耗 ${cost} 星力`,
  });

  if (!spendResult.ok) {
    return Response.json(
      { ok: false, message: "星力不足，无法完成本次对话。" },
      { status: 402 },
    );
  }

  await createSession({
    userId: spendResult.nextSession.userId,
    emailMasked: spendResult.nextSession.emailMasked,
    tier: spendResult.nextSession.tier,
    starBalance: spendResult.nextSession.starBalance,
  });

  const balanceAfter = spendResult.nextSession.starBalance;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let cancelled = false;

      const send = (event: ChatStreamEvent) => {
        if (cancelled) {
          return;
        }

        try {
          controller.enqueue(encodeStreamEvent(event));
        } catch {
          cancelled = true;
        }
      };

      const close = () => {
        if (cancelled) {
          return;
        }

        try {
          controller.close();
        } catch {
          cancelled = true;
        }
      };

      send({
        type: "start",
        data: {
          intent: prepared.intent,
          steps: prepared.local.steps,
          toolCalls: prepared.local.toolCalls,
          cost,
          balanceAfter,
        },
      });

      void (async () => {
        try {
          const result = await runPreparedAiChatStream(prepared, {
            signal: request.signal,
            onDelta(delta) {
              send({ type: "delta", delta });
            },
            onReplace(answer) {
              send({ type: "replace", answer });
            },
          });
          const chatSessionId = await saveChatTurn({
            userId: session.userId,
            question,
            answer: result.answer,
            toolResults: {
              intent: result.intent,
              palmImageId: palmImage?.id,
              toolCalls: result.toolCalls,
              provider: result.provider,
              model: result.model,
              usageLogId: result.usageLogId,
              costCents: result.costCents,
              costEstimate: result.costEstimate,
            },
            tokensIn: result.tokensIn,
            tokensOut: result.tokensOut,
          });

          send({
            type: "complete",
            data: {
              ok: true,
              ...result,
              chatSessionId,
              cost,
              balanceAfter,
            },
          });
        } catch (error) {
          if (process.env.NODE_ENV !== "production" && !request.signal.aborted) {
            console.error("Chat stream failed.", error);
          }

          if (!request.signal.aborted) {
            send({
              type: "error",
              message: "回答生成中断，请稍后再试。",
              balanceAfter,
            });
          }
        } finally {
          close();
        }
      })();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
