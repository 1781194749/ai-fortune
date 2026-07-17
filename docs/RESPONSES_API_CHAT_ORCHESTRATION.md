# Responses API Chat Orchestration Plan

## Current State

- `/api/chat` uses AI SDK `streamText` with `provider.responses(model)`.
- Deterministic tools run before the model in `prepareAiChat`: intent, profile, tarot, bazi, bagua, palm image checks.
- The model receives a compiled JSON prompt and generates final wording.
- Persistence is owned by local `AiSession`, `AiTurn`, `Message`, and `UsageLog`.

This is intentionally stable for the current quality pass. It fixes answer structure, fallback quality, error UX, context compilation, and quality tracing without changing the model transport.

## Target Shape

Move chat generation behind a small runtime adapter:

```ts
type ChatRuntimeResult = {
  answer: string;
  provider: "openai" | "local";
  model: string;
  responseId?: string;
  conversationId?: string;
  outputItems?: unknown[];
  tokensIn?: number;
  tokensOut?: number;
};
```

The first adapter can wrap today's AI SDK path. A second adapter can call `client.responses.create` directly and own Responses-specific tool loops.

## Responses Tool Loop

OpenAI's function calling guide describes the loop as: send tools, receive function calls, execute application code, send function outputs back, then receive final text. For Xuanji chat, map current local tools into strict function schemas:

- `classify_intent`
- `read_profile`
- `draw_tarot_spread`
- `calculate_bazi`
- `generate_bagua`
- `check_palm_image`

Keep code-owned facts code-owned. For example, if `session.userId` or `palmImageId` is already known, do not ask the model to provide it as a tool argument.

## State And Persistence

Use one of two state modes:

- Short term: keep local DB as source of truth, store OpenAI `response.id` on `AiTurn`, and pass `previous_response_id` when continuing a clean chain.
- Longer term: create an OpenAI conversation per `AiSession`, store its ID locally, and attach each response to that conversation.

The conversation-state docs note that `previous_response_id` can chain turns, but previous input tokens in the chain are still billed. The same docs also distinguish response retention from conversation item persistence, so privacy and retention choices must be explicit before enabling long-lived OpenAI conversations.

## Streaming Events

Replace AI SDK `toUIMessageStream` merging with a Responses event bridge:

- text deltas -> `text-delta`
- `function_call` item added -> `data-chatStart` / tool running state
- function output appended -> tool completed state
- final response completed -> `data-chatComplete`
- model or tool failure -> `data-chatError`

The current `ChatQualityTrace` should stay transport-agnostic and receive `responseId`, `toolNames`, `contextSummary`, `answerShape`, latency, and error code from either adapter.

## Migration Steps

1. Add nullable persistence fields: `AiTurn.openaiResponseId`, `AiSession.openaiConversationId`, and optional response output metadata in `UsageLog.metadata`.
2. Introduce `ChatModelRuntime` and move today's AI SDK generation into `ai-sdk-chat-runtime.ts`.
3. Add `responses-chat-runtime.ts` behind `CHAT_RESPONSES_RUNTIME=1`.
4. Port deterministic tools into strict Responses function schemas, starting with read-only tools.
5. Stream Responses events into the existing UI message protocol.
6. Compare quality with `npm run chat:quality-check`, replayed manual samples, and production traces.
7. Roll out by cohort; fall back to the AI SDK adapter on tool-loop or streaming errors.

## Official References

- OpenAI tools guide: https://developers.openai.com/api/docs/guides/tools
- OpenAI function calling guide: https://developers.openai.com/api/docs/guides/function-calling
- OpenAI conversation state guide: https://developers.openai.com/api/docs/guides/conversation-state
