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
  import { createHmac } from "node:crypto";
  import { readFileSync } from "node:fs";
  import path from "node:path";
  import { starCosts } from "@/lib/commerce";
  import { generateBagua } from "@/lib/bagua";
  import { getInviteLinkForUser, parseInviteCode } from "@/lib/invite-rewards";
  import { getDeepReportReadiness } from "@/lib/deep-report-readiness";
  import { renderDeepReportAnswer } from "@/lib/prompts/deep-report-composer";
  import { buildDeepReportEvidencePackage } from "@/lib/prompts/evidence";
  import { upsertFortuneProfile } from "@/lib/fortune-profile-store";
  import { createPalmImageUpload } from "@/lib/image-upload-store";
  import {
    closeMockOrder,
    completeMockOrder,
    createMockOrder,
    createPaymentOrder,
    getMockOrder,
    markExternalPaymentOrderPaid,
    refundPaidOrder,
  } from "@/lib/mock-payment-store";
  import { resolvePublicAppOrigin } from "@/lib/public-origin";
  import {
    createQiniuUploadToken,
    getQiniuPublicUrl,
    isPalmImageKeyOwnedByUser,
    isQiniuPublicDomainSecure,
  } from "@/lib/qiniu";
  import { getPublicReportView } from "@/lib/report-public-view";
  import { createMockReport } from "@/lib/report-store";
  import { buildTarotReading, drawTarot, getTarotDeckAudit } from "@/lib/tarot";

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
    const liveOrder = await createPaymentOrder(userId, "trial_7d", "ALIPAY");
    const livePayment = await completeMockOrder(liveOrder.id, session);
    assert.equal(livePayment.ok, false);
    assert.equal(livePayment.reason, "PROVIDER_MISMATCH");
    assert.equal((await getMockOrder(liveOrder.id))?.status, "PENDING");
    assert.equal(await closeMockOrder({ orderId: liveOrder.id, userId }), null);

    const closedOrder = await createMockOrder(userId, "trial_7d");
    assert.equal((await closeMockOrder({ orderId: closedOrder.id, userId }))?.status, "CLOSED");
    const closedPayment = await completeMockOrder(closedOrder.id, session);
    assert.equal(closedPayment.ok, false);
    assert.equal(closedPayment.reason, "ORDER_NOT_PAYABLE");
    assert.equal((await getMockOrder(closedOrder.id))?.status, "CLOSED");

    const payableOrder = await createMockOrder(userId, "trial_7d");
    const paid = await completeMockOrder(payableOrder.id, session);
    assert.equal(paid.ok, true);
    assert.equal((await getMockOrder(payableOrder.id))?.status, "PAID");
    assert.equal(paid.ok && paid.nextSession.starBalance, 88);

    const paidAgain = await completeMockOrder(payableOrder.id, session);
    assert.equal(paidAgain.ok, true);
    assert.equal(paidAgain.ok && paidAgain.nextSession.starBalance, 88);

    const externalOrder = await createPaymentOrder("flow-user-external", "trial_7d", "ALIPAY");
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
    assert.match(reading.recommendation, /二选一倾向/);
  });

  await check("八卦选择题返回明确行动方向", () => {
    const reading = generateBagua({
      userId: "flow-user-bagua",
      question: "两个工作机会应该如何选择",
      timeframe: "未来三个月",
    }, "fixed-seed");
    assert.equal(reading.topic, "选择");
    assert.match(reading.choiceDirection ?? "", /选择方向/);

    const optionReading = generateBagua({
      userId: "flow-user-bagua-options",
      question: "机会A做大平台，机会B做创业公司，我应该选哪个？",
      timeframe: "未来三个月",
    }, "fixed-option-seed");
    assert.equal(optionReading.topic, "选择");
    assert.match(optionReading.choiceDirection ?? "", /选择方向：.*选项 [AB]/);

    const careerReading = generateBagua({
      userId: "flow-user-bagua-career",
      question: "最近工作机会和事业发展如何",
      timeframe: "未来三个月",
    }, "fixed-career-seed");
    assert.equal(careerReading.topic, "事业");
    assert.equal(careerReading.choiceDirection, undefined);
  });

  await check("邀请链接隐藏用户标识且可校验", () => {
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
    assert.equal(
      parseInviteCode("v1_" + legacyEncoded + "_" + legacySignature)?.inviterId,
      legacyUserId,
    );
    delete process.env.INVITE_CODE_SECRET;
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
    process.env.QINIU_PUBLIC_DOMAIN = "https://images.xuanji.click/";
    const key = "palm/flow-user-palm/2026-07-22/test.webp";
    assert.equal(isPalmImageKeyOwnedByUser({ key, userId: "flow-user-palm" }), true);
    assert.equal(isPalmImageKeyOwnedByUser({ key, userId: "another-user" }), false);
    assert.equal(getQiniuPublicUrl(key), "https://images.xuanji.click/" + key);
    delete process.env.QINIU_PUBLIC_DOMAIN;
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
