# Responses API Chat Orchestration

## Runtime Shape

`/api/chat` uses the AI SDK Responses provider and a real function-calling loop. The model receives strict tool schemas, selects tools with `toolChoice: "auto"`, application code executes the selected function, and the tool output is returned to the model by the SDK.

The runtime deliberately separates three responsibilities:

1. Code-owned guardrails: authentication, entitlement settlement, attachment ownership, safety preflight, subject privacy, timeouts and budgets.
2. Model-owned action choice: answer directly, ask one necessary question, or call an eligible tool.
3. Controller-owned loop: execute functions, reject invalid calls, stop repeats, force a final step and record the trace.

The current implementation is in `src/lib/ai-orchestrator.ts` and uses `provider.responses(model)`.

## Chat Model And Durable Context

Chat answer generation resolves its model independently from vision and other structured workloads. Chat is pinned to `gpt-5.6-sol`; when `OPENAI_CHAT_MODEL` is configured, it must match that value instead of silently selecting another tier. `OPENAI_STRUCTURED_MODEL` and `OPENAI_VISION_MODEL` keep their existing fallback behavior.

`resolveChatModelPolicy` keeps the selected chat model at maximum reasoning effort while assigning quick, formal and deep delivery modes distinct output and history budgets. `buildDurableChatConversationContext` applies those history budgets without relying on a fixed tail slice: it preserves the session's first user goal and durable constraints, keeps recent user/assistant turns complete, and adds neutral summaries of reusable historical conclusions. Raw tool metadata and internal function names are never copied into model-facing conversation text.

Maximum reasoning can legitimately take longer than the former low-reasoning path. The chat agent gives the model one 40-second controller budget (`OPENAI_AGENT_TIMEOUT_MS`) for tool selection, final generation and the single repair opportunity. This leaves time inside the 45-second request acceptance window to render a validated deterministic fallback, persist the turn and send the completion event. The route also forwards the browser request's abort signal, so closing or cancelling the request stops the active model call instead of leaving hidden work running.

## Model Tools

The model can select from these business tools when the current request makes them eligible:

- `profile_reader`: reads the current member's minimum necessary fields for a declared purpose. `userId` is injected from the server session and is never a model argument.
- `tarot_spread_generator`: creates one tarot spread only for an explicit tarot request.
- `bazi_calculator`: validates complete birth input and calculates the chart. It never guesses a missing birth time.
- `bagua_generator`: creates a hexagram only for an explicit bagua request.
- `palm_image_checker`: validates that the owned attachment is a usable palm photo and performs vision analysis. Non-palm and unclear images do not produce palm claims.

Intent classification is not an agent tool. Safety classification runs before the loop. Birth-field validation is part of `bazi_calculator`.

This means there are five model-callable tools, not eight. Safety preflight, subject detection and answer validation may appear in traces, but the model cannot invoke or bypass them.

The controller exposes only the tools authorized for the current text, subject and attachment state. The model still chooses whether to call an eligible tool; pre-filtering prevents irrelevant schemas from competing for attention and prevents a page entry from authorizing a conflicting action.

## One-Pass Answer Pipeline

Tool selection and the user-facing answer belong to the same model loop. The final step disables all tools and returns one of five lightweight answer semantics: `direct`, `missing_input`, `decision`, `reading`, or `safety`.

The Responses API receives those semantics through one flat, strict JSON object. Unused fields are `null` or empty arrays, and the application validates the fields required by the selected `kind`. This avoids `oneOf`/discriminated-union schemas, which are rejected by some Responses-compatible gateways even though ordinary strict objects and multiple function tools work correctly.

There is no unconditional second model call that rewrites the answer into a generic reading report. A second call is allowed only as a single repair attempt after a schema, grounding, relevance or safety validation failure. If repair also fails, the controller renders a concise evidence-based fallback.

## Durable Answer Delivery

Validated answer text is never sent before it is recoverable. The route first writes a serialized delivery checkpoint containing the complete assistant answer, result snapshot, intended final status and usage record. Only after that transaction commits does `streamLocalAnswer` emit text. A complete stream promotes the checkpoint to `COMPLETED`; if delivery is cancelled after output begins, the server preserves the already generated complete answer and finalizes the turn as `PARTIAL` so replay can recover it instead of keeping only the first delta.

Cancellation before any text refunds the reserved quota and hides the checkpoint. If the final promotion transaction fails after text was emitted, the durable checkpoint remains readable through conversation history and idempotent replay, so refreshing cannot erase an answer the customer already saw. `AiSession.activeTurnId` remains locked until delivery is finalized; a stale checkpoint is recovered as a saved partial answer instead of being refunded and discarded.

## Subject And Profile Policy

Every turn maintains a reading subject:

- `self`: member profile may be read when the current task genuinely needs it.
- `other`: member profile is unavailable and cannot be used to fill third-party facts.
- `relationship`: member data can only describe the questioner and is read only when explicitly requested.
- `unspecified`: profile access is unavailable; a person-bound tool call must identify the subject or ask for clarification.

Profile reads are limited to once per turn and are purpose-scoped (`bazi_input`, `personalization`, or `conversation_memory`). Existing user input and existing tool evidence take priority over another read.

For a self-directed bazi request, the model first reads the profile when the current message does not contain a complete birth date, time and place. The tool returns `baziReady` plus the exact `missingFields`; a partial profile must never cause the assistant to ask again for fields that are already stored.

The profile is not read for third-party questions, method introductions, ordinary advice, product questions, birthday gifts, or merely because the user entered chat from a bazi/tarot/palm page. A relationship question can read the member profile only when the user explicitly asks to combine their own saved information; it can never use that profile as the other person's data.

## Loop Limits And Exit Conditions

Defaults:

```text
MAX_AGENT_STEPS=4
MAX_AGENT_TOOL_CALLS=4
MAX_PROFILE_READS=1
MAX_DIVINATION_TOOL_CALLS=1
OPENAI_AGENT_TIMEOUT_MS=40000
tool timeout=12000ms
initial structured-output recovery attempts=1 (final-only, no tool replay)
answer repair attempts=1
```

Parallel function calls are disabled so budget and subject state remain deterministic. A completed method tool sets the next step to final-only; it does not stop before the model has produced an answer. The final step has no active tools. The loop exits when the model returns a final answer, asks for missing input, completes the final-only step after a method result, hits a privacy/safety boundary, repeats the same call, exhausts its budget, or reaches its timeout.

Follow-up turns reuse subject-bound evidence. A new spread, chart or hexagram is generated only when the user explicitly asks to redraw or recalculate.

`needs_input` is a terminal delivery state, not a reading report. It is free of charge and renders only the minimum concrete question needed to continue. It must not include confidence labels, evidence sections, reality checks, reversible-action copy or other formal-reading scaffolding.

## Answer Validation And Degradation

The final structured answer is checked for:

- schema and evidence references;
- unsupported tarot, bazi, bagua or palm claims;
- missing information requested after a tool already completed;
- third-party profile leakage;
- invented A/B options;
- failure to address supplied decision options.

One model repair is allowed. If repair fails, the response is marked degraded, delivered as `COMPLETED`, and waived from the user's quota. `PARTIAL` is reserved for an interrupted delivery, not answer quality. Deterministic fallback answers directly address common ordinary questions instead of asking for generic topic/time/option fields.

## Quality Gate

Run:

```bash
npm run chat:quality-check
npm run chat:quality-gate
```

The local check covers routing, safety, subject isolation, negative tool triggers and deterministic fallback behavior. The formal gate loads `.env`/`.env.local`, requires real model answers and a semantic grader, and scores relevance, grounding, tool selection, subject integrity, safety, usefulness, uncertainty and brand voice.

The formal gate sends curated real-model samples serially. This avoids turning gateway queueing under a synthetic burst into a false content-quality failure; production requests use the same 40-second controller budget and retain deterministic fallback for provider or validation failures. Formal Go also requires a separate, complete human-review JSONL with at least a 90% pass rate; automated semantic grading cannot populate the human reviewer or pass fields.

Structured-output workloads use `OPENAI_STRUCTURED_MODEL` when configured and otherwise fall back to `OPENAI_DEFAULT_MODEL`. Keep this pointed at a model that has passed an actual structured-output probe; a model appearing in `/models` or completing an unstructured request is not sufficient evidence. `CHAT_QUALITY_GRADER_MODEL` can override it for the quality grader only.

## Official References

- OpenAI tools guide: https://developers.openai.com/api/docs/guides/tools
- OpenAI function calling guide: https://developers.openai.com/api/docs/guides/function-calling
- OpenAI conversation state guide: https://developers.openai.com/api/docs/guides/conversation-state
