import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporaryDir = await mkdtemp(path.join(os.tmpdir(), "xuanji-flow-check-"));
const outputFile = path.join(temporaryDir, "flow-check.mjs");

const aliasPlugin = {
  name: "local-flow-check-alias",
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

    builder.onResolve({ filter: /^server-only$/ }, () => ({
      path: "server-only",
      namespace: "server-only-stub",
    }));
    builder.onLoad({ filter: /.*/, namespace: "server-only-stub" }, () => ({
      contents: "",
      loader: "js",
    }));
  },
};

const testSource = String.raw`
  import assert from "node:assert/strict";
  import { createHmac, generateKeyPairSync } from "node:crypto";
  import { readFileSync } from "node:fs";
  import path from "node:path";
  import { validateHumanReviewJsonl } from "./scripts/chat-quality-human-review";
  import { starCosts } from "@/lib/commerce";
  import { generateBagua } from "@/lib/bagua";
  import { calculateBazi } from "@/lib/bazi";
  import {
    createEmailAuthAcceptanceSignature,
    isExplicitLocalEmailAuthRequest,
    isLocalDevelopmentTestEmail,
    requestEmailCode,
    verifyEmailAuthBypass,
    verifyEmailCode,
  } from "@/lib/email-auth";
  import {
    toPublicBaguaChart,
    toPublicBaziChart,
  } from "@/lib/fortune-chart-public";
  import { getInviteLinkForUser, parseInviteCode } from "@/lib/invite-rewards";
  import { getDeepReportReadiness } from "@/lib/deep-report-readiness";
  import { getGoogleRedirectUri, getPublicAppOrigin } from "@/lib/google-auth";
  import { renderDeepReportAnswer } from "@/lib/prompts/deep-report-composer";
  import {
    buildDeepReportEvidencePackage,
    validateUnsupportedPredictiveClaims,
  } from "@/lib/prompts/evidence";
  import {
    assessSafetyRisk,
    buildSafetyAssessmentText,
  } from "@/lib/prompts/safety-policy";
  import { upsertFortuneProfile } from "@/lib/fortune-profile-store";
  import { createPalmImageUpload } from "@/lib/image-upload-store";
  import {
    PALM_IMAGE_SERVICE_UNAVAILABLE_BODY,
    toCustomerPalmImageIssue,
    toPublicPalmImage,
  } from "@/lib/palm-image-public";
  import {
    CUSTOMER_ANSWER_BLOCKED,
    PRODUCT_IDENTITY_ANSWER,
    getCustomerAnswerBoundaryIssues,
    getProductIdentityAnswerForConversation,
    sanitizeCustomerAnswer,
    sanitizeCustomerDocument,
  } from "@/lib/product-identity";
  import {
    toPublicChatProgress,
    toPublicChatTrace,
  } from "@/lib/chat-public-result";
  import {
    closePendingPaymentOrder,
    closeMockOrder,
    completeMockOrder,
    createMockOrder,
    createPaymentOrder,
    getMockOrder,
    getUserMockOrders,
    markExternalPaymentOrderPaid,
    refundPaidOrder,
  } from "@/lib/mock-payment-store";
  import { createLivePaymentCheckout } from "@/lib/payment-adapters";
  import { resolvePublicAppOrigin } from "@/lib/public-origin";
  import {
    createPalmImageKey,
    createQiniuUploadToken,
    getQiniuPublicUrl,
    isPalmImageKeyOwnedByUser,
    isQiniuPublicDomainSecure,
  } from "@/lib/qiniu";
  import { getPublicReportView } from "@/lib/report-public-view";
  import { createMockReport } from "@/lib/report-store";
  import { buildTarotReading, drawTarot, getTarotDeckAudit } from "@/lib/tarot";
  import { tarotDeck } from "@/lib/tarot-deck";

  const results = [];
  const check = async (name, run) => {
    await run();
    results.push(name);
  };

  await check("订单状态机拒绝真实渠道假支付与关闭订单复活", async () => {
    const userId = "flow-user-payment";
    const session = {
      userId,
      emailMasked: "fl**@example.com",
      tier: "FREE",
      starBalance: 8,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    const liveOrder = await createPaymentOrder(userId, "monthly", "ALIPAY");
    const livePayment = await completeMockOrder(liveOrder.id, session);
    assert.equal(livePayment.ok, false);
    assert.equal(livePayment.reason, "PROVIDER_MISMATCH");
    assert.equal((await getMockOrder(liveOrder.id))?.status, "PENDING");
    assert.equal(await closeMockOrder({ orderId: liveOrder.id, userId }), null);
    assert.equal(await closePendingPaymentOrder({
      orderId: liveOrder.id,
      userId,
      provider: "WECHAT_PAY",
    }), null);
    assert.equal((await closePendingPaymentOrder({
      orderId: liveOrder.id,
      userId,
      provider: "ALIPAY",
    }))?.status, "CLOSED");
    const closedLivePayment = await markExternalPaymentOrderPaid({
      orderId: liveOrder.id,
      provider: "ALIPAY",
      providerOrderId: "closed-live-order",
    });
    assert.equal(closedLivePayment.ok, false);

    Object.assign(process.env, {
      WECHAT_PAY_ENABLED: "true",
      WECHAT_APP_ID: "flow-wechat-app",
      WECHAT_PAY_MCH_ID: "flow-wechat-merchant",
      WECHAT_PAY_API_V3_KEY: "01234567890123456789012345678901",
      WECHAT_PAY_PRIVATE_KEY: "invalid-private-key",
      WECHAT_PAY_SERIAL_NO: "flow-wechat-serial",
      WECHAT_PAY_PLATFORM_PUBLIC_KEY: "invalid-public-key",
    });
    const failedWechatCheckout = await createLivePaymentCheckout({
      session,
      productCode: "monthly",
      channel: "wechat_pay",
    });
    assert.equal(failedWechatCheckout.ok, false);
    const failedWechatOrder = (await getUserMockOrders(userId))
      .find((order) => order.provider === "WECHAT_PAY");
    assert.equal(failedWechatOrder?.provider, "WECHAT_PAY");
    assert.equal(failedWechatOrder?.status, "CLOSED");
    for (const key of [
      "WECHAT_PAY_ENABLED",
      "WECHAT_APP_ID",
      "WECHAT_PAY_MCH_ID",
      "WECHAT_PAY_API_V3_KEY",
      "WECHAT_PAY_PRIVATE_KEY",
      "WECHAT_PAY_SERIAL_NO",
      "WECHAT_PAY_PLATFORM_PUBLIC_KEY",
    ]) {
      delete process.env[key];
    }

    const validWechatPrivateKey = generateKeyPairSync("rsa", { modulusLength: 2048 })
      .privateKey.export({ type: "pkcs8", format: "pem" });
    Object.assign(process.env, {
      WECHAT_PAY_ENABLED: "true",
      WECHAT_APP_ID: "flow-wechat-app",
      WECHAT_PAY_MCH_ID: "flow-wechat-merchant",
      WECHAT_PAY_API_V3_KEY: "01234567890123456789012345678901",
      WECHAT_PAY_PRIVATE_KEY: validWechatPrivateKey,
      WECHAT_PAY_SERIAL_NO: "flow-wechat-serial",
      WECHAT_PAY_PLATFORM_PUBLIC_KEY: "unused-in-checkout",
    });
    const existingOrderIds = new Set((await getUserMockOrders(userId)).map((order) => order.id));
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(
      JSON.stringify({ code: "SYSTEM_ERROR", message: "provider unavailable" }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
    const uncertainWechatCheckout = await createLivePaymentCheckout({
      session,
      productCode: "monthly",
      channel: "wechat_pay",
    });
    globalThis.fetch = originalFetch;
    assert.equal(uncertainWechatCheckout.ok, false);
    const uncertainWechatOrder = (await getUserMockOrders(userId))
      .find((order) => order.provider === "WECHAT_PAY" && !existingOrderIds.has(order.id));
    assert.equal(uncertainWechatOrder?.status, "PENDING");
    for (const key of [
      "WECHAT_PAY_ENABLED",
      "WECHAT_APP_ID",
      "WECHAT_PAY_MCH_ID",
      "WECHAT_PAY_API_V3_KEY",
      "WECHAT_PAY_PRIVATE_KEY",
      "WECHAT_PAY_SERIAL_NO",
      "WECHAT_PAY_PLATFORM_PUBLIC_KEY",
    ]) {
      delete process.env[key];
    }

    const closedOrder = await createMockOrder(userId, "monthly");
    assert.equal((await closeMockOrder({ orderId: closedOrder.id, userId }))?.status, "CLOSED");
    const closedPayment = await completeMockOrder(closedOrder.id, session);
    assert.equal(closedPayment.ok, false);
    assert.equal(closedPayment.reason, "ORDER_NOT_PAYABLE");
    assert.equal((await getMockOrder(closedOrder.id))?.status, "CLOSED");

    const payableOrder = await createMockOrder(userId, "monthly");
    const paid = await completeMockOrder(payableOrder.id, session);
    assert.equal(paid.ok, true);
    assert.equal((await getMockOrder(payableOrder.id))?.status, "PAID");
    assert.equal(paid.ok && paid.nextSession.starBalance, 28);

    const paidAgain = await completeMockOrder(payableOrder.id, session);
    assert.equal(paidAgain.ok, true);
    assert.equal(paidAgain.ok && paidAgain.nextSession.starBalance, 28);

    const externalOrder = await createPaymentOrder("flow-user-external", "monthly", "ALIPAY");
    const externalPaid = await markExternalPaymentOrderPaid({
      orderId: externalOrder.id,
      provider: "ALIPAY",
      providerOrderId: "external-flow-1",
    });
    assert.equal(externalPaid.ok, true);
    const refunded = await refundPaidOrder({
      orderId: externalOrder.id,
      reason: "本地回归测试",
      operator: "flow-check",
    });
    assert.equal(refunded.ok, true);
    const repeatedCallback = await markExternalPaymentOrderPaid({
      orderId: externalOrder.id,
      provider: "ALIPAY",
      providerOrderId: "external-flow-1-repeat",
    });
    assert.equal(repeatedCallback.ok, false);
    assert.equal(repeatedCallback.reason, "ORDER_NOT_PAYABLE");
    assert.equal((await getMockOrder(externalOrder.id))?.status, "REFUNDED");
  });

  await check("塔罗牌库与二选一结论完整", () => {
    assert.deepEqual(getTarotDeckAudit(), { total: 78, major: 22, minor: 56 });
    const minors = tarotDeck.filter((card) => card.arcana === "minor");
    assert.equal(new Set(minors.map((card) => card.upright)).size, 56);
    assert.equal(new Set(minors.map((card) => card.reversed)).size, 56);
    assert.equal(new Set(minors.map((card) => card.advice)).size, 56);
    assert.match(minors.find((card) => card.name === "权杖六")?.upright ?? "", /认可|胜利/);
    assert.match(minors.find((card) => card.name === "宝剑六")?.upright ?? "", /离开混乱|过渡/);
    assert.match(minors.find((card) => card.name === "星币六")?.upright ?? "", /给予|接受|资源/);
    assert.equal(starCosts.tarot_love.min, 30);
    assert.equal(starCosts.tarot_love.max, 30);
    const cards = drawTarot("decision", "两个工作机会该如何选择", "flow-user-tarot", "fixed-seed");
    assert.equal(cards.length, 4);
    assert.equal(new Set(cards.map((card) => card.card)).size, cards.length);
    const reading = buildTarotReading({
      spread: "decision",
      question: "两个工作机会该如何选择",
      cards,
    });
    assert.match(reading.recommendation, /二选一解读/);
    assert.match(reading.recommendation, /正逆位不作分数高低/);
  });

  await check("八卦选择题不按标签或哈希强行选边", () => {
    const reading = generateBagua({
      userId: "flow-user-bagua",
      question: "两个工作机会应该如何选择",
      timeframe: "未来三个月",
    }, "fixed-seed");
    assert.equal(reading.topic, "选择");
    assert.match(reading.choiceDirection ?? "", /选择提示/);
    assert.match(reading.choiceDirection ?? "", /不按选项字母或排列顺序强行选边/);

    const optionReading = generateBagua({
      userId: "flow-user-bagua-options",
      question: "机会A做大平台，机会B做创业公司，我应该选哪个？",
      timeframe: "未来三个月",
    }, "fixed-option-seed");
    assert.equal(optionReading.topic, "选择");
    assert.doesNotMatch(optionReading.choiceDirection ?? "", /选项 [AB].*更适合/);

    const careerReading = generateBagua({
      userId: "flow-user-bagua-career",
      question: "最近工作机会和事业发展如何",
      timeframe: "未来三个月",
    }, "fixed-career-seed");
    assert.equal(careerReading.topic, "事业");
    assert.equal(careerReading.choiceDirection, undefined);
  });

  await check("命盘公开 DTO 只包含客户页面字段", () => {
    const bagua = toPublicBaguaChart(generateBagua({
      userId: "private-bagua-user-id",
      question: "未来三个月是否适合换工作",
      timeframe: "未来三个月",
    }, "public-dto-seed"));
    assert.deepEqual(Object.keys(bagua).sort(), [
      "changedHexagram",
      "choiceDirection",
      "lines",
      "mainHexagram",
      "moving",
      "movingLine",
      "mutualHexagram",
      "oppositeHexagram",
      "reversedHexagram",
      "topic",
      "yao",
    ]);
    assert.equal(JSON.stringify(bagua).includes("private-bagua-user-id"), false);
    assert.equal(Object.hasOwn(bagua, "input"), false);
    assert.equal(Object.hasOwn(bagua, "audit"), false);

    const bazi = toPublicBaziChart(calculateBazi({
      name: "私密姓名",
      gender: "male",
      birthDate: "1990-01-02",
      birthTime: "08:30",
      birthPlace: "北京",
    }));
    assert.deepEqual(Object.keys(bazi).sort(), [
      "bazi",
      "branchRelations",
      "counts",
      "dayMaster",
      "luck",
      "lunar",
      "pillars",
      "solar",
      "strongest",
      "tenGodCounts",
      "timeStandard",
      "weakest",
      "weightedCounts",
      "zodiac",
    ]);
    assert.equal(JSON.stringify(bazi).includes("私密姓名"), false);
    for (const internalKey of ["input", "wuxing", "auxiliary", "genderRule"]) {
      assert.equal(Object.hasOwn(bazi, internalKey), false);
    }

    const noGenderBazi = toPublicBaziChart(calculateBazi({
      birthDate: "1990-01-02",
      birthTime: "08:30",
      birthPlace: "北京",
    }));
    assert.equal(noGenderBazi.luck.start, undefined);
    assert.equal(noGenderBazi.luck.currentDaYun, undefined);
    assert.deepEqual(noGenderBazi.luck.daYun, []);
    assert.equal(noGenderBazi.luck.annual.length, 6);
    assert.equal(noGenderBazi.timeStandard.trueSolarTimeAdjusted, false);
    assert.match(noGenderBazi.timeStandard.note, /当地标准钟表时间|未做.*真太阳时校正/);
  });

  await check("邮箱开发认证必须显式申请或使用限时 HMAC 且不能授权后台", () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousAcceptanceSecret = process.env.EMAIL_AUTH_ACCEPTANCE_SECRET;

    try {
      process.env.NODE_ENV = "development";
      process.env.EMAIL_AUTH_ACCEPTANCE_SECRET = "flow-email-acceptance-secret-at-least-32-characters";

      const unrequestedEmail = "unrequested@example.com";
      const localRequest = new Request("http://127.0.0.1:3000/api/auth/email/verify", {
        method: "POST",
        headers: { "x-xuanji-local-email-auth": "1" },
      });
      assert.equal(isExplicitLocalEmailAuthRequest(localRequest), true);
      assert.equal(isLocalDevelopmentTestEmail(unrequestedEmail), true);
      assert.equal(isLocalDevelopmentTestEmail("admin@real-company.cn"), false);
      assert.equal(
        isExplicitLocalEmailAuthRequest(localRequest, "admin@real-company.cn"),
        false,
      );
      assert.equal(verifyEmailCode(unrequestedEmail, "000000"), null);
      assert.equal(
        verifyEmailAuthBypass({
          request: localRequest,
          email: unrequestedEmail,
          code: "000000",
          returnTo: "/member",
        }),
        null,
      );

      const localEmail = "requested-local@example.com";
      const localCode = requestEmailCode(localEmail, { localDevelopment: true });
      assert.deepEqual(verifyEmailCode(localEmail, localCode.code), {
        method: "local_development",
        adminEligible: false,
      });

      const bypassEmail = "requested-bypass@example.com";
      requestEmailCode(bypassEmail, { localDevelopment: true });
      assert.deepEqual(
        verifyEmailAuthBypass({
          request: localRequest,
          email: bypassEmail,
          code: "000000",
          returnTo: "/member",
        }),
        { method: "local_development", adminEligible: false },
      );

      const acceptanceEmail = "signed-acceptance@example.com";
      const timestamp = String(Date.now());
      const signature = createEmailAuthAcceptanceSignature({
        timestamp,
        email: acceptanceEmail,
        code: "000000",
        returnTo: "/chat",
      });
      assert.ok(signature);
      const acceptanceRequest = new Request("https://preview.example.com/api/auth/email/verify", {
        method: "POST",
        headers: {
          "x-xuanji-email-auth-timestamp": timestamp,
          "x-xuanji-email-auth-signature": signature,
        },
      });
      assert.deepEqual(
        verifyEmailAuthBypass({
          request: acceptanceRequest,
          email: acceptanceEmail,
          code: "000000",
          returnTo: "/chat",
        }),
        { method: "acceptance_hmac", adminEligible: false },
      );

      const verifiedEmail = "delivered-code@example.com";
      const verifiedCode = requestEmailCode(verifiedEmail);
      assert.deepEqual(verifyEmailCode(verifiedEmail, verifiedCode.code), {
        method: "email_code",
        adminEligible: true,
      });

      process.env.NODE_ENV = "production";
      assert.equal(isExplicitLocalEmailAuthRequest(localRequest), false);
      assert.equal(
        verifyEmailAuthBypass({
          request: acceptanceRequest,
          email: "production@example.com",
          code: "000000",
          returnTo: "/chat",
        }),
        null,
      );

      const adminAuthSource = readFileSync(
        path.join(process.cwd(), "src/lib/admin-auth.ts"),
        "utf8",
      );
      const sessionSource = readFileSync(
        path.join(process.cwd(), "src/lib/session.ts"),
        "utf8",
      );
      assert.match(adminAuthSource, /session\.adminEligible === true/);
      assert.match(sessionSource, /existing\?\.userId === input\.userId/);
      assert.match(sessionSource, /payload\.adminEligible === true/);
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
      if (previousAcceptanceSecret === undefined) delete process.env.EMAIL_AUTH_ACCEPTANCE_SECRET;
      else process.env.EMAIL_AUTH_ACCEPTANCE_SECRET = previousAcceptanceSecret;
    }
  });

  await check("邀请链接仅接受 v2 密文且归因 Cookie 不重复存邀请人 ID", () => {
    process.env.INVITE_CODE_SECRET = "flow-invite-secret";
    const link = getInviteLinkForUser("private-user-id", "https://xuanji.click");
    const encodedUserId = Buffer.from("private-user-id").toString("base64url");
    assert.equal(link.inviteUrl.startsWith("https://xuanji.click/invite/"), true);
    assert.equal(link.code.startsWith("v2."), true);
    assert.equal(link.displayCode.startsWith("XJ-"), true);
    assert.equal(link.displayCode.includes("private-user-id"), false);
    assert.equal(link.inviteUrl.includes(encodedUserId), false);
    assert.equal(parseInviteCode(link.code)?.inviterId, "private-user-id");
    assert.equal(parseInviteCode(link.code.slice(0, -1) + "A"), null);

    const legacyUserId = "legacy-user";
    const legacyEncoded = Buffer.from(legacyUserId).toString("base64url");
    const legacySignature = createHmac("sha256", process.env.INVITE_CODE_SECRET)
      .update("v1:" + legacyUserId)
      .digest("base64url")
      .slice(0, 18);
    assert.equal(parseInviteCode("v1_" + legacyEncoded + "_" + legacySignature), null);

    const inviteSource = readFileSync(
      path.join(process.cwd(), "src/lib/invite-rewards.ts"),
      "utf8",
    );
    const attributionType = inviteSource.match(
      /type InviteAttributionPayload = \{([\s\S]*?)\};/,
    )?.[1] ?? "";
    assert.match(attributionType, /code:\s*string/);
    assert.doesNotMatch(attributionType, /inviterId/);
    assert.doesNotMatch(inviteSource, /legacyInviteCodeVersion|signLegacyInviteUserId/);
    delete process.env.INVITE_CODE_SECRET;
  });

  await check("公开页面隐藏备案主体姓名并仅展示备案号", () => {
    const publicPageSources = [
      readFileSync(path.join(process.cwd(), "src/app/page.tsx"), "utf8"),
      readFileSync(path.join(process.cwd(), "src/app/legal/[slug]/page.tsx"), "utf8"),
    ];

    for (const source of publicPageSources) {
      assert.doesNotMatch(source, /legalEntity\.companyName|运营主体：/);
      assert.match(source, /icpRecordNo/);
    }
  });

  await check("公开报告脱敏个人问题与档案字段", () => {
    const report = {
      id: "report-flow",
      userId: "private-user-id",
      type: "YEARLY",
      status: "COMPLETED",
      title: "张三的年度报告",
      summary: "张三在金融产品方向关注转岗与亲密关系。",
      content: "出生于1990年1月2日的张三问：我该转岗吗？当前方向是金融产品，长期关注转岗、亲密关系。",
      inputSnapshot: {
        question: "我该转岗吗",
        profile: {
          name: "张三",
          birthDate: "1990-01-02",
          careerFocus: "金融产品",
          recurringTopics: ["转岗", "亲密关系"],
        },
      },
      toolResults: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const publicView = getPublicReportView(report);
    const output = [publicView.title, publicView.summary, publicView.content].join("\n");

    for (const sensitive of ["张三", "1990年1月2日", "我该转岗吗", "金融产品", "亲密关系"]) {
      assert.equal(output.includes(sensitive), false, "公开报告仍包含敏感信息：" + sensitive);
    }
  });

  await check("公开报告按词边界脱敏单字姓名且保留正常词语", () => {
    const report = {
      id: "report-single-character-name",
      userId: "private-user-id",
      type: "YEARLY",
      status: "COMPLETED",
      title: "王的年度报告",
      summary: "王目前关注事业，帝王气质只是正文中的普通词。",
      content: "用户王问：下一步怎么做？“帝王”不是姓名。",
      inputSnapshot: {
        profile: { name: "王" },
      },
      toolResults: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const publicView = getPublicReportView(report);
    const output = [publicView.title, publicView.summary, publicView.content].join("\n");

    assert.doesNotMatch(output, /王的年度报告|王目前|用户王问/);
    assert.match(output, /帝王气质/);
    assert.match(output, /“帝王”不是姓名/);
  });

  await check("正式质量门禁严格校验人工 JSONL", () => {
    const expectedSampleIds = Array.from({ length: 10 }, (_, index) => "sample-" + index);
    const records = expectedSampleIds.map((sampleId, index) => ({
      sampleId,
      reviewer: "评审员" + index,
      pass: index < 9,
    }));
    const valid = validateHumanReviewJsonl({
      jsonl: records.map((record) => JSON.stringify(record)).join("\n"),
      expectedSampleIds,
    });
    assert.equal(valid.checks.every((item) => item.ok), true);
    assert.equal(valid.reviewedCount, 10);
    assert.equal(valid.passedCount, 9);
    assert.equal(valid.passRate, 0.9);

    const semanticReviewer = validateHumanReviewJsonl({
      jsonl: records
        .map((record, index) => JSON.stringify(index === 0
          ? { ...record, reviewer: "semantic:gpt-5.6-sol" }
          : record))
        .join("\n"),
      expectedSampleIds,
    });
    assert.equal(
      semanticReviewer.checks.find((item) => item.id === "human-review:reviewer:sample-0")?.ok,
      false,
    );

    const stringPass = validateHumanReviewJsonl({
      jsonl: records
        .map((record, index) => JSON.stringify(index === 0
          ? { ...record, pass: "true" }
          : record))
        .join("\n"),
      expectedSampleIds,
    });
    assert.equal(
      stringPass.checks.find((item) => item.id === "human-review:pass:sample-0")?.ok,
      false,
    );

    const incomplete = validateHumanReviewJsonl({
      jsonl: records.slice(0, 9).map((record) => JSON.stringify(record)).join("\n"),
      expectedSampleIds,
    });
    assert.equal(incomplete.checks.find((item) => item.id === "human-review:coverage")?.ok, false);

    const duplicateAndUnknown = validateHumanReviewJsonl({
      jsonl: [
        ...records,
        records[0],
        { sampleId: "unknown", reviewer: "评审员", pass: true },
      ].map((record) => JSON.stringify(record)).join("\n"),
      expectedSampleIds,
    });
    assert.equal(
      duplicateAndUnknown.checks.some((item) => item.id === "human-review:duplicate:sample-0" && !item.ok),
      true,
    );
    assert.equal(
      duplicateAndUnknown.checks.some((item) => item.id.startsWith("human-review:unknown-sample") && !item.ok),
      true,
    );
  });

  await check("客户回答与报告脱敏器拦截内部信息且不误伤正常正文", () => {
    const normalAnswer = "结论：先核对明天到期的续约条件，再比较月底的工作机会。";
    const normalDocument = "事业节奏正在趋稳，建议本月先完成一个可验证的小目标。";
    const leakedAnswer = "服务返回 DATABASE_UNAVAILABLE，usageLogId 是 chat_usage_private_123。";
    const leakedDocument = [
      "报告由 gpt-5.6-sol 生成。",
      "调用 intent_classifier 后记录 promptMetadata 和 chat_usage_private_456。",
      "配置项 OPENAI_API_KEY，本服务的数据存储使用 PostgreSQL 与 Qiniu。",
    ].join("\n");

    assert.equal(sanitizeCustomerAnswer(normalAnswer, "direct", "下一步先做什么？"), normalAnswer);
    assert.equal(sanitizeCustomerDocument(normalDocument), normalDocument);
    assert.equal(
      sanitizeCustomerAnswer(leakedAnswer, "direct", "下一步先做什么？"),
      CUSTOMER_ANSWER_BLOCKED,
    );
    assert.equal(
      sanitizeCustomerAnswer("底层是 gpt-5.6-sol。", "identity_boundary", "你是什么模型？"),
      PRODUCT_IDENTITY_ANSWER,
    );
    assert.ok(getCustomerAnswerBoundaryIssues(leakedAnswer).length > 0);

    for (const allowedText of [
      "Gemini is an air sign，双子座更重视交流与变化。",
      "比较 OpenAI 与 Anthropic 的工作机会时，先看岗位职责和团队稳定性。",
      "你可以评估 Gemini 相关岗位，但不要只看公司名。",
      "我建议选择 PostgreSQL 团队，因为岗位职责更清晰。",
      "Redis 方向更符合你的技术基础，先确认晋升和轮岗机制。",
      "Prisma 是一家技术公司，比较机会时仍要看职责与退出成本。",
      "ISO_IEC_27001 是信息安全管理体系标准。",
      "AWS_ACCESS_KEY_ID 不应提交到代码库。",
    ]) {
      assert.equal(sanitizeCustomerAnswer(allowedText, "direct", "帮我分析这个选择"), allowedText);
      assert.deepEqual(getCustomerAnswerBoundaryIssues(allowedText), []);
    }

    for (const internalText of [
      "safety_risk_classifier 已完成。",
      "AGENT_PROVIDER_UNAVAILABLE_OR_FAILED",
      "usage_123e4567-e89b-12d3-a456-426614174000",
      "OPENAI_DEFAULT_MODEL",
      "本服务使用 gpt-5.6-sol。",
      "本服务的数据存储使用 PostgreSQL 与 Redis。",
      "内部错误码：UNEXPECTED_BACKEND_FAILURE",
      "errorCode=UNEXPECTED_BACKEND_FAILURE",
    ]) {
      assert.ok(
        getCustomerAnswerBoundaryIssues(internalText).length > 0,
        "未拦截内部信息：" + internalText,
      );
    }

    const sanitizedDocument = sanitizeCustomerDocument(leakedDocument);
    for (const internalText of [
      "gpt-5.6-sol",
      "intent_classifier",
      "promptMetadata",
      "chat_usage_private_456",
      "OPENAI_API_KEY",
      "PostgreSQL",
      "Qiniu",
    ]) {
      assert.equal(
        sanitizedDocument.toLowerCase().includes(internalText.toLowerCase()),
        false,
        "报告仍包含内部信息：" + internalText,
      );
    }

    assert.equal(
      getProductIdentityAnswerForConversation("具体版本呢？", [
        { role: "user", content: "你是什么模型？" },
        { role: "assistant", content: PRODUCT_IDENTITY_ANSWER },
      ]),
      PRODUCT_IDENTITY_ANSWER,
    );
    assert.equal(
      getProductIdentityAnswerForConversation("这个版本怎么部署？", [
        { role: "user", content: "我在比较两个技术方案。" },
      ]),
      null,
    );

    const carriedSafetyText = buildSafetyAssessmentText(
      "具体怎么做？",
      ["我想自杀"],
    );
    assert.equal(assessSafetyRisk(carriedSafetyText).blocked, true);
    for (const followUp of [
      "那几点去最不容易被发现？",
      "换个号联系会不会更好？",
      "然后呢？",
    ]) {
      const contextualStalkingText = buildSafetyAssessmentText(
        followUp,
        ["我准备蹲守前任并查定位"],
      );
      const contextualAssessment = assessSafetyRisk(contextualStalkingText);
      assert.equal(contextualAssessment.blocked, true);
      assert.ok(contextualAssessment.categories.includes("stalking"));
    }
    const chainedStalkingText = buildSafetyAssessmentText(
      "然后呢？",
      [
        "我准备蹲守前任并查定位",
        "那几点去最不容易被发现？",
        "换个号联系会不会更好？",
      ],
    );
    assert.equal(assessSafetyRisk(chainedStalkingText).blocked, true);
    assert.equal(
      buildSafetyAssessmentText("我今天好多了，想聊工作选择。", ["我想自杀"]),
      "我今天好多了，想聊工作选择。",
    );
    assert.equal(
      buildSafetyAssessmentText("换个话题，我想聊产品设计。", ["我准备蹲守前任并查定位"]),
      "换个话题，我想聊产品设计。",
    );

    assert.ok(
      validateUnsupportedPredictiveClaims("未来三个月他会主动复合。安排好见面即可。").length > 0,
    );
    assert.deepEqual(
      validateUnsupportedPredictiveClaims("未来三个月是否复合仍无法判断，请观察对方是否持续主动联系。"),
      [],
    );
    assert.deepEqual(
      validateUnsupportedPredictiveClaims(
        "是否真的不对等，要看对方会不会主动联系、兑现安排。",
      ),
      [],
    );

    const turnServiceSource = readFileSync(
      path.join(process.cwd(), "src/lib/chat-turn-service.ts"),
      "utf8",
    );
    assert.match(turnServiceSource, /firstUserMessage[\s\S]{0,1200}take:\s*63/);
    assert.doesNotMatch(turnServiceSource, /take:\s*16/);
    const chatClientSource = readFileSync(
      path.join(process.cwd(), "src/app/chat/chat-client.tsx"),
      "utf8",
    );
    assert.match(chatClientSource, /!part\.data\.counted/);
  });

  await check("聊天公开进度使用封闭文案且边界回答不展示仪式", () => {
    const progress = toPublicChatProgress({
      step: "tool",
      status: "completed",
      label: "模型按当前问题选择了 2 次必要工具调用",
      detail: "控制器会限制模型可以选择不调用工具",
      method: "general",
      serviceMode: "quick",
    });
    const progressText = JSON.stringify(progress);
    assert.doesNotMatch(progressText, /模型|控制器|工具调用|intent_classifier/);
    assert.equal(progress.label, "分析依据已准备");

    for (const answerShape of ["identity_boundary", "missing_info", "safety_boundary"]) {
      const trace = toPublicChatTrace({
        intent: "general",
        steps: [{ label: "内部步骤", detail: "模型自主判断" }],
        toolCalls: [],
        answerShape,
      });
      assert.equal(trace.showRitual, false);
      assert.doesNotMatch(JSON.stringify(trace), /内部步骤|模型自主判断/);
    }
  });

  await check("客户页面统一使用公开 DTO 且不序列化内部配置", () => {
    const reportFiles = [
      "src/app/reports/[reportId]/page.tsx",
      "src/app/reports/[reportId]/export/page.tsx",
      "src/app/member/reports/page.tsx",
    ];

    for (const filename of reportFiles) {
      const source = readFileSync(path.join(process.cwd(), filename), "utf8");
      assert.match(source, /toCustomerReport/);
    }

    const inviteClient = readFileSync(
      path.join(process.cwd(), "src/app/member/invite-reward-card.tsx"),
      "utf8",
    );
    assert.doesNotMatch(inviteClient, /inviteeId|shortId/);
    assert.match(inviteClient, /inviteeLabel/);

    const purchaseButton = readFileSync(
      path.join(process.cwd(), "src/app/member/purchase-button.tsx"),
      "utf8",
    );
    assert.doesNotMatch(purchaseButton, /LivePaymentGate|livePaymentGate/);
    assert.match(purchaseButton, /livePaymentEnabled/);

    const livePaymentRoute = readFileSync(
      path.join(process.cwd(), "src/app/api/payments/live/orders/route.ts"),
      "utf8",
    );
    assert.doesNotMatch(livePaymentRoute, /Response\.json\(result\)/);
    assert.match(livePaymentRoute, /toPublicLiveCheckout/);

    const loginForm = readFileSync(
      path.join(process.cwd(), "src/app/login/login-form.tsx"),
      "utf8",
    );
    assert.doesNotMatch(loginForm, /AUTH_GOOGLE_ENABLED|GOOGLE_CLIENT_ID|GOOGLE_CLIENT_SECRET/);

    const historyRoute = readFileSync(
      path.join(process.cwd(), "src/app/api/chat/sessions/[sessionId]/route.ts"),
      "utf8",
    );
    assert.match(historyRoute, /message\.role === "assistant"\s*\? sanitizeCustomerAnswer/);
  });

  await check("报告默认私密并关闭历史自动公开链接", () => {
    const migration = readFileSync(
      path.join(process.cwd(), "prisma/migrations/0004_reports_private_by_default/migration.sql"),
      "utf8",
    );
    assert.match(migration, /UPDATE "Report"/);
    assert.match(migration, /SET "shareSlug" = NULL/);
  });

  await check("深度报告缺资料拦截并在八字手相齐全后闭环", async () => {
    const userId = "flow-user-deep-report-" + process.pid + "-" + Date.now();
    const missing = await getDeepReportReadiness({ userId, productCode: "yearly_report" });
    assert.equal(missing.ok, false);
    assert.equal(missing.missing[0]?.code, "BAZI_PROFILE_INCOMPLETE");
    await assert.rejects(
      () => createPaymentOrder(userId, "yearly_report", "MOCK"),
      (error) => error && typeof error === "object" && error.code === "DEEP_REPORT_REQUIREMENTS_MISSING",
    );

    await upsertFortuneProfile(userId, {
      name: "测试用户",
      birthDate: "1990-01-02",
      birthTime: "08:30",
      birthPlace: "北京",
      calendarType: "solar",
      recurringTopics: [],
    });
    const yearlyReady = await getDeepReportReadiness({ userId, productCode: "yearly_report" });
    assert.equal(yearlyReady.ok, true);
    const compositeMissing = await getDeepReportReadiness({ userId, productCode: "composite_report" });
    assert.equal(compositeMissing.ok, false);
    assert.equal(compositeMissing.missing[0]?.code, "PALM_READING_REQUIRED");

    const image = await createPalmImageUpload({
      userId,
      qiniuKey: "palm/" + userId + "/2026-07-22/test.webp",
      url: "mock://palm/" + userId + "/2026-07-22/test.webp",
      contentType: "image/webp",
      sizeBytes: 1024,
      metadata: { provider: "mock" },
    });
    const palmReport = await createMockReport({
      userId,
      type: "PALM",
      title: "手相分析",
      summary: "手相证据摘要",
      content: "手相证据正文",
      inputSnapshot: { imageId: image.id },
      toolResults: { analyzer: "flow-check" },
    });
    assert.equal(palmReport.shareSlug, undefined);
    const compositeReady = await getDeepReportReadiness({ userId, productCode: "composite_report" });
    assert.equal(compositeReady.ok, true);
    assert.equal(compositeReady.palmEvidence?.imageId, image.id);
    assert.equal((await createPaymentOrder(userId, "composite_report", "MOCK")).status, "PENDING");

    const lunarUserId = "flow-user-lunar-profile-" + process.pid + "-" + Date.now();
    await upsertFortuneProfile(lunarUserId, {
      birthDate: "1990-01-27",
      birthTime: "08:30",
      calendarType: "lunar",
      recurringTopics: [],
    });
    assert.equal(
      (await getDeepReportReadiness({ userId: lunarUserId, productCode: "yearly_report" })).ok,
      true,
    );
  });

  await check("深度报告正确读取持久化八字证据", () => {
    const evidence = buildDeepReportEvidencePackage({
      subject: { kind: "self", label: "本人", memberProfileRole: "subject" },
      profile: {
        baziChart: {
          bazi: ["丁丑", "壬子", "戊申", "丁巳"],
          pillars: [
            {
              key: "day",
              label: "日柱",
              heavenlyStem: "戊",
              stemElement: "土",
              yinYang: "阳",
            },
          ],
        },
        wuxingProfile: {
          counts: { 木: 0, 火: 3, 土: 2, 金: 1, 水: 2 },
          strongest: "火",
          weakest: ["木"],
        },
      },
      localDraft: { content: "年度报告草稿" },
    });
    const wuxing = evidence.items.find((item) => item.evidenceId === "bazi.wuxing");
    const dayMaster = evidence.items.find((item) => item.evidenceId === "bazi.dayMaster");
    assert.match(wuxing?.summary ?? "", /火:3/);
    assert.equal((wuxing?.summary ?? "").includes("火:0"), false);
    assert.equal(dayMaster?.label, "日主 · 戊土");

    const rendered = renderDeepReportAnswer({
      status: "fallback",
      executiveSummary: { title: "年度报告", summary: "摘要", confidence: "low" },
      sections: [
        {
          sectionId: "profile_baseline",
          title: "档案基线",
          evidenceRefs: ["bazi.pillars"],
          insights: ["结论"],
        },
        { sectionId: "structure", title: "命理结构", evidenceRefs: [], insights: ["结论"] },
        { sectionId: "themes", title: "关键主题", evidenceRefs: [], insights: ["结论"] },
        { sectionId: "action_strategy", title: "行动策略", evidenceRefs: [], insights: ["结论"] },
      ],
      actionPlan: [],
      uncertainty: { level: "high", reasons: [] },
      realityChecks: [],
      safetyNotice: "仅供参考。",
    }, evidence);
    assert.equal(rendered.includes("四柱：四柱："), false);
  });

  await check("手相对象存储地址由服务端生成且绑定当前账号", () => {
    process.env.AUTH_SESSION_SECRET = "flow-auth-secret-for-palm-storage";
    process.env.QINIU_PUBLIC_DOMAIN = "https://images.xuanji.click/";
    const key = createPalmImageKey({
      userId: "flow-user-palm",
      filename: "张三的手掌照片.webp",
    });
    assert.equal(isPalmImageKeyOwnedByUser({ key, userId: "flow-user-palm" }), true);
    assert.equal(isPalmImageKeyOwnedByUser({ key, userId: "another-user" }), false);
    assert.equal(key.includes("flow-user-palm"), false);
    assert.equal(key.includes("张三"), false);
    assert.equal(getQiniuPublicUrl(key), "https://images.xuanji.click/" + key);
    delete process.env.AUTH_SESSION_SECRET;
    delete process.env.QINIU_PUBLIC_DOMAIN;
  });

  await check("手相图片客户 DTO 与错误响应不泄露内部记录", () => {
    const internalImage = {
      id: "image-public-boundary",
      userId: "private-user-id",
      kind: "PALM",
      qiniuKey: "palm/private-user-id/secret.webp",
      url: "https://images.xuanji.click/palm/public.webp",
      contentType: "image/webp",
      sizeBytes: 2048,
      metadata: {
        provider: "qiniu",
        originalName: "private-name.webp",
        hash: "private-hash",
      },
      deletedAt: "2026-07-28T00:00:00.000Z",
      createdAt: "2026-07-28T00:00:00.000Z",
    };
    const publicImage = toPublicPalmImage(internalImage);

    assert.deepEqual(Object.keys(publicImage).sort(), [
      "contentType",
      "createdAt",
      "id",
      "sizeBytes",
      "url",
    ]);
    assert.equal(JSON.stringify(publicImage).includes("private-user-id"), false);
    assert.equal(JSON.stringify(publicImage).includes("private-hash"), false);
    assert.equal(publicImage.url, "/api/images/palm/image-public-boundary");
    assert.deepEqual(Object.keys(PALM_IMAGE_SERVICE_UNAVAILABLE_BODY), ["ok", "message"]);

    for (const issue of [
      toCustomerPalmImageIssue("invalid_image"),
      toCustomerPalmImageIssue("unverified"),
    ]) {
      assert.equal(Object.hasOwn(issue, "code"), false);
      assert.doesNotMatch(
        JSON.stringify(issue),
        /OPENAI_API_KEY|OpenAI|PostgreSQL|Prisma|Qiniu|七牛|error\.message/i,
      );
    }

    const imageApiSources = [
      "src/app/api/images/palm/route.ts",
      "src/app/api/images/palm/[imageId]/route.ts",
    ].map((filename) => readFileSync(path.join(process.cwd(), filename), "utf8"));

    for (const source of imageApiSources) {
      assert.match(source, /toPublicPalmImage/);
      assert.doesNotMatch(source, /code:\s*error\.code|message:\s*error\.message/);
    }

    const palmPage = readFileSync(path.join(process.cwd(), "src/app/palm/page.tsx"), "utf8");
    const palmRoute = readFileSync(
      path.join(process.cwd(), "src/app/api/fortune/palm/route.ts"),
      "utf8",
    );
    const tokenRoute = readFileSync(
      path.join(process.cwd(), "src/app/api/storage/qiniu/upload-token/route.ts"),
      "utf8",
    );
    assert.match(palmPage, /initialImage=\{images\[0\] \? toPublicPalmImage\(images\[0\]\) : null\}/);
    assert.match(palmRoute, /toCustomerPalmImageIssue/);
    assert.match(palmRoute, /image:\s*toPublicPalmImage\(image\)/);
    assert.doesNotMatch(tokenRoute, /\.\.\.token/);
    assert.doesNotMatch(tokenRoute, /\b(?:provider|debug|metadata):/);
  });

  await check("七牛上传凭证遵循官方 URL-safe Base64 签名格式", () => {
    process.env.QINIU_ACCESS_KEY = "flow-access-key";
    process.env.QINIU_SECRET_KEY = "flow-secret-key";
    process.env.QINIU_BUCKET = "flow-bucket";
    process.env.QINIU_REGION = "z1";
    process.env.QINIU_PUBLIC_DOMAIN = "https://images.xuanji.click";

    const ticket = createQiniuUploadToken({
      userId: "flow-user-qiniu",
      filename: "palm.png",
      contentType: "image/png",
      sizeBytes: 1024,
    });
    assert.equal(ticket.mode, "qiniu");
    assert.equal(ticket.uploadUrl, "https://upload-z1.qiniup.com");
    const [accessKey, encodedSign, encodedPolicy] = ticket.token.split(":");
    assert.equal(accessKey, "flow-access-key");
    assert.equal(
      encodedSign,
      createHmac("sha1", "flow-secret-key")
        .update(encodedPolicy)
        .digest("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_"),
    );
    assert.equal(encodedSign.endsWith("="), true);
    const policy = JSON.parse(
      Buffer.from(
        encodedPolicy.replace(/-/g, "+").replace(/_/g, "/"),
        "base64",
      ).toString("utf8"),
    );
    assert.equal(policy.scope, "flow-bucket:" + ticket.key);
    assert.equal(policy.mimeLimit, "image/png");
    assert.equal(policy.fsizeLimit, 1024);
    assert.equal(policy.deadline, Math.floor(new Date(ticket.expiresAt).getTime() / 1000));
    assert.ok(policy.deadline > Math.floor(Date.now() / 1000));
    assert.ok(policy.deadline <= Math.floor(Date.now() / 1000) + 60 * 60);

    for (const name of [
      "QINIU_ACCESS_KEY",
      "QINIU_SECRET_KEY",
      "QINIU_BUCKET",
      "QINIU_REGION",
      "QINIU_PUBLIC_DOMAIN",
    ]) {
      delete process.env[name];
    }
  });

  await check("正式环境仅在七牛公开域名启用 HTTPS 后开放图片上传", () => {
    assert.equal(
      isQiniuPublicDomainSecure({ QINIU_PUBLIC_DOMAIN: "http://www.xuanji.click" }),
      false,
    );
    assert.equal(
      isQiniuPublicDomainSecure({ QINIU_PUBLIC_DOMAIN: "https://images.xuanji.click/" }),
      true,
    );
    assert.equal(
      isQiniuPublicDomainSecure({ QINIU_PUBLIC_DOMAIN: "not-a-url" }),
      false,
    );
  });

  await check("正式域名优先于可伪造 Host 头", () => {
    process.env.NODE_ENV = "production";
    process.env.APP_URL = "https://xuanji.click";
    const hostileHeaders = new Headers({
      host: "attacker.example",
      "x-forwarded-host": "attacker.example",
      "x-forwarded-proto": "https",
    });
    assert.equal(resolvePublicAppOrigin({ headers: hostileHeaders }), "https://xuanji.click");

    delete process.env.APP_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    assert.equal(resolvePublicAppOrigin({ headers: hostileHeaders }), "https://xuanji.click");
    const invalidHeaders = new Headers({ host: "0.0.0.0", "x-forwarded-proto": "http" });
    assert.equal(
      resolvePublicAppOrigin({ headers: invalidHeaders, requestUrl: "http://localhost:3000" }),
      "https://xuanji.click",
    );
  });

  await check("本地 Google 登录保留 localhost 回调", () => {
    process.env.NODE_ENV = "development";
    process.env.APP_URL = "https://xuanji.click";

    assert.equal(getPublicAppOrigin("http://localhost:3000"), "http://localhost:3000");
    assert.equal(
      getGoogleRedirectUri("http://localhost:3000"),
      "http://localhost:3000/api/auth/google/callback",
    );

    process.env.NODE_ENV = "production";
    assert.equal(getPublicAppOrigin("http://localhost:3000"), "https://xuanji.click");
    assert.equal(
      getGoogleRedirectUri("http://localhost:3000"),
      "https://xuanji.click/api/auth/google/callback",
    );
  });

  console.log("本地业务回归通过：" + results.length + " 项");
  for (const result of results) {
    console.log("[OK] " + result);
  }
`;

try {
  delete process.env.DATABASE_URL;
  process.env.NODE_ENV = "development";
  process.env.XUANJI_DISABLE_LOCAL_PROFILE_PERSISTENCE = "1";

  await build({
    stdin: {
      contents: testSource,
      loader: "ts",
      resolveDir: rootDir,
      sourcefile: "local-user-flow-regression-entry.ts",
    },
    outfile: outputFile,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    banner: {
      js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
    },
    plugins: [aliasPlugin],
    external: ["pg-native"],
    logLevel: "silent",
  });

  await import(`${pathToFileURL(outputFile).href}?v=${Date.now()}`);
} finally {
  delete process.env.XUANJI_DISABLE_LOCAL_PROFILE_PERSISTENCE;
  await rm(temporaryDir, { recursive: true, force: true });
}
