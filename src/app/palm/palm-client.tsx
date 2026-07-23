"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ClipboardEvent, useEffect, useState } from "react";
import {
  BadgeCheck,
  Camera,
  Coins,
  Loader2,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { getStarCostLabel } from "@/lib/commerce";

type UploadToken = {
  mode: "qiniu" | "mock";
  key: string;
  token: string;
  uploadUrl: string | null;
  publicUrl: string;
  expiresAt: string;
};

export type PalmImage = {
  id: string;
  qiniuKey: string;
  url: string;
  contentType: string;
  sizeBytes: number;
};

type PalmReport = {
  id: string;
  title: string;
  summary: string;
  content: string;
};

type PalmResult = {
  steps: string[];
  cost: number;
  balanceAfter: number;
  paymentSource?: "membership_quota";
  entitlement?: {
    kind: "palm_reading";
    remainingBefore: number;
    remainingAfter: number;
  };
  image: PalmImage;
  report: PalmReport;
};

async function readJson<T>(response: Response) {
  const data = (await response.json()) as T & { ok: boolean; message?: string };

  if (!response.ok || data.ok === false) {
    throw new Error(data.message ?? "请求失败。");
  }

  return data;
}

export function PalmClient({
  initialBalance,
  initialPalmQuota,
  initialImage,
}: {
  initialBalance: number;
  initialPalmQuota: number;
  initialImage: PalmImage | null;
}) {
  const router = useRouter();
  const [balance, setBalance] = useState(initialBalance);
  const [palmQuota, setPalmQuota] = useState(initialPalmQuota);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [focus, setFocus] = useState("看看我最近的状态和关系节奏");
  const [image, setImage] = useState<PalmImage | null>(initialImage);
  const [result, setResult] = useState<PalmResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [consent, setConsent] = useState(false);
  const [message, setMessage] = useState(
    initialImage
      ? "已载入最近保存的图片档案，可以继续分析或删除。"
      : initialPalmQuota > 0
      ? `优先使用会员手相额度，当前剩余 ${initialPalmQuota} 次。`
      : `手相简析消耗 ${getStarCostLabel("palm_reading")}。`,
  );

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  function selectPalmFile(nextFile: File | null) {
    if (nextFile && !["image/jpeg", "image/png", "image/webp"].includes(nextFile.type)) {
      setMessage("请使用 JPG、PNG 或 WebP 图片。");
      return;
    }

    if (nextFile && nextFile.size > 8 * 1024 * 1024) {
      setMessage("图片大小需在 8MB 以内。");
      return;
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setFile(nextFile);
    setPreviewUrl(nextFile ? URL.createObjectURL(nextFile) : "");
    setImage(null);
    setResult(null);

    if (nextFile) {
      setMessage(`已选择 ${nextFile.name || "粘贴的图片"}，请确认授权后保存。`);
    }
  }

  function pastePalmImage(event: ClipboardEvent<HTMLButtonElement>) {
    const clipboardImage = Array.from(event.clipboardData.items)
      .find((item) => item.kind === "file" && item.type.startsWith("image/"))
      ?.getAsFile();

    if (!clipboardImage) {
      setMessage("剪贴板里没有可用的图片，请先复制一张手掌图片。");
      return;
    }

    event.preventDefault();
    selectPalmFile(clipboardImage);
  }

  async function uploadImage() {
    if (!file) {
      setMessage("请先选择一张手掌图片。");
      return;
    }

    if (!consent) {
      setMessage("请先确认图片上传授权。");
      return;
    }

    setLoading(true);
    setResult(null);
    setMessage("正在安全读取图片...");

    try {
      const tokenResponse = await fetch("/api/storage/qiniu/upload-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          sizeBytes: file.size,
        }),
      });
      const tokenData = await readJson<{ ok: true } & UploadToken>(tokenResponse);
      let hash: string | undefined;

      if (tokenData.mode === "qiniu") {
        if (!tokenData.uploadUrl) {
          throw new Error("图片上传服务暂不可用，请稍后再试。");
        }

        setMessage("正在安全上传图片...");

        const formData = new FormData();
        formData.set("token", tokenData.token);
        formData.set("key", tokenData.key);
        formData.set("file", file);

        const uploadResponse = await fetch(tokenData.uploadUrl, {
          method: "POST",
          body: formData,
        });
        const uploadResult = await uploadResponse.json().catch(() => null) as
          | { hash?: string; key?: string }
          | null;

        if (!uploadResponse.ok) {
          throw new Error("图片上传失败，请检查网络后重试。");
        }

        hash = uploadResult?.hash;
      }

      setMessage("正在建立图片档案...");

      const imageResponse = await fetch("/api/images/palm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: tokenData.key,
          url: tokenData.publicUrl,
          contentType: file.type,
          sizeBytes: file.size,
          originalName: file.name,
          provider: tokenData.mode,
          hash,
        }),
      });
      const imageData = await readJson<{ ok: true; image: PalmImage }>(imageResponse);

      setImage(imageData.image);
      setMessage("图片已安全保存，可以开始分析。");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "上传失败。");
    } finally {
      setLoading(false);
    }
  }

  async function analyze() {
    if (!image) {
      setMessage("请先保存一张手相图片。");
      return;
    }

    setLoading(true);
    setMessage("正在生成手相简析...");

    try {
      const response = await fetch("/api/fortune/palm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageId: image.id, focus }),
      });
      const data = await readJson<{ ok: true } & PalmResult>(response);

      setResult(data);
      setBalance(data.balanceAfter);

      if (data.paymentSource === "membership_quota" && data.entitlement) {
        setPalmQuota(data.entitlement.remainingAfter);
        setMessage(
          `本次使用 1 次会员手相额度，剩余 ${data.entitlement.remainingAfter} 次；星力保持 ${data.balanceAfter}。`,
        );
        router.refresh();
        return;
      }

      setMessage(`本次消耗 ${data.cost} 星力，剩余 ${data.balanceAfter} 星力。`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "手相简析失败。");
    } finally {
      setLoading(false);
    }
  }

  async function deleteImage() {
    if (!image) {
      return;
    }

    setLoading(true);
    setMessage("正在删除图片档案...");

    try {
      const response = await fetch(`/api/images/palm/${image.id}`, {
        method: "DELETE",
      });
      await readJson<{ ok: true }>(response);

      setImage(null);
      setResult(null);
      setMessage("图片档案已删除。");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "删除失败。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[0.82fr_1.18fr]">
      <section className="rounded-lg border border-[#3a3023] bg-[#12100d] p-5">
        <div className="grid gap-3 border-b border-[#2f261a] pb-5 sm:grid-cols-2">
          <div className="rounded-md bg-[#080705] p-4">
            <Coins className="text-[#c8a15a]" size={24} aria-hidden="true" />
            <p className="mt-3 text-sm text-[#b9ad99]">当前星力</p>
            <p className="font-ritual text-4xl text-[#fff7e8]">{balance}</p>
          </div>
          <div className="rounded-md bg-[#080705] p-4">
            <Camera className="text-[#c8a15a]" size={24} aria-hidden="true" />
            <p className="mt-3 text-sm text-[#b9ad99]">手相额度</p>
            <p className="font-ritual text-4xl text-[#fff7e8]">{palmQuota}</p>
            <p className="mt-1 text-xs text-[#9f927f]">
              {palmQuota > 0 ? "本次优先抵扣会员额度" : `无额度时消耗 ${getStarCostLabel("palm_reading")}`}
            </p>
          </div>
        </div>

        <label className="mt-5 block">
          <span className="text-sm text-[#d8cab2]">手掌图片</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => {
              selectPalmFile(event.target.files?.[0] ?? null);
            }}
            className="mt-2 block w-full rounded-md border border-[#3a3023] bg-[#080705] px-4 py-3 text-sm text-[#d8cab2] file:mr-4 file:rounded-md file:border-0 file:bg-[#c8a15a] file:px-3 file:py-2 file:font-semibold file:text-[#130f09]"
          />
        </label>

        <button
          type="button"
          onPaste={pastePalmImage}
          onClick={() => setMessage("已准备接收图片，请按 Command+V（Windows 按 Ctrl+V）粘贴。")}
          className="mt-3 w-full rounded-md border border-dashed border-[#6a5431] bg-[#080705] px-4 py-3 text-left text-sm leading-6 text-[#d8cab2] transition hover:border-[#c8a15a] focus:border-[#c8a15a] focus:outline-none"
        >
          也可以点击这里，再按 Command+V（Windows 按 Ctrl+V）粘贴手掌图片
        </button>

        <label className="mt-5 block">
          <span className="text-sm text-[#d8cab2]">关注主题</span>
          <textarea
            value={focus}
            onChange={(event) => setFocus(event.target.value)}
            rows={3}
            className="mt-2 w-full resize-none rounded-md border border-[#3a3023] bg-[#080705] px-4 py-3 text-[#fff7e8] outline-none transition focus:border-[#c8a15a]"
          />
        </label>

        <label className="mt-5 flex gap-3 rounded-md border border-[#2f261a] bg-[#080705] p-3 text-sm leading-6 text-[#d8cab2]">
          <input
            type="checkbox"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
            className="mt-1 size-4 accent-[#c8a15a]"
          />
          <span>
            我确认拥有该图片的合法处理权，并同意按
            <Link href="/legal/upload-consent" className="mx-1 text-[#f0d49a] hover:text-[#fff7e8]">
              图片上传授权
            </Link>
            进行存储和分析。
          </span>
        </label>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={uploadImage}
            disabled={loading || !file || !consent}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-[#c8a15a] px-5 font-semibold text-[#130f09] transition hover:bg-[#f0d49a] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? <Loader2 className="animate-spin" size={18} /> : <Upload size={18} />}
            保存图片
          </button>
          <button
            type="button"
            onClick={analyze}
            disabled={loading || !image}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-md border border-[#6a5431] bg-[#080705] px-5 font-semibold text-[#fff7e8] transition hover:border-[#c8a15a] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />}
            生成简析
          </button>
        </div>

        {image ? (
          <button
            type="button"
            onClick={deleteImage}
            disabled={loading}
            className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-[#5d2b22] bg-[#160c09] px-4 text-sm font-semibold text-[#f0d49a] transition hover:border-[#b34c32] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Trash2 size={16} aria-hidden="true" />
            删除图片档案
          </button>
        ) : null}

        <p className="mt-3 text-sm text-[#b9ad99]">{message}</p>
      </section>

      <section className="rounded-lg border border-[#3a3023] bg-[#12100d] p-5">
        <p className="text-sm font-semibold text-[#c8a15a]">手相过程</p>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          {(result?.steps ?? ["校验手相图片", "保存图片档案", "分析三条主线", "生成手相报告"]).map(
            (step, index) => (
              <div
                key={step}
                className="rounded-md border border-[#2f261a] bg-[#080705] p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex size-7 items-center justify-center rounded-md bg-[#c8a15a]/12 text-sm text-[#f0d49a]">
                    {index + 1}
                  </span>
                  {result ? (
                    <BadgeCheck className="text-[#3c8b72]" size={17} aria-hidden="true" />
                  ) : null}
                </div>
                <p className="mt-3 text-sm text-[#d8cab2]">{step}</p>
              </div>
            ),
          )}
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-[0.78fr_1.22fr]">
          <div className="rounded-lg border border-[#2f261a] bg-[#080705] p-4">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt="手掌图片预览"
                className="aspect-[4/5] w-full rounded-md object-cover"
              />
            ) : (
              <div className="flex aspect-[4/5] w-full items-center justify-center rounded-md bg-[#12100d]">
                <Camera className="text-[#6f6455]" size={42} aria-hidden="true" />
              </div>
            )}
            {image ? (
              <p className="mt-3 text-xs leading-5 text-[#79b8b1]">
                图片已保存，仅用于你授权的手相分析。
              </p>
            ) : null}
          </div>

          {result ? (
            <article className="rounded-lg border border-[#3a3023] bg-[#080705] p-5">
              <p className="text-sm text-[#b9ad99]">报告编号：{result.report.id}</p>
              <h2 className="mt-2 font-ritual text-3xl text-[#fff7e8]">
                {result.report.title}
              </h2>
              <div className="mt-4 whitespace-pre-line text-sm leading-8 text-[#d8cab2]">
                {result.report.content}
              </div>
              <Link
                href={`/reports/${result.report.id}`}
                className="mt-5 inline-flex h-10 items-center justify-center rounded-md border border-[#6a5431] px-4 text-sm font-semibold text-[#fff7e8] transition hover:border-[#c8a15a]"
              >
                查看完整报告
              </Link>
            </article>
          ) : (
            <div className="rounded-lg border border-[#2f261a] bg-[#080705] p-5 text-sm leading-7 text-[#b9ad99]">
              手相简析会在这里生成，并同步进入报告中心。
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
