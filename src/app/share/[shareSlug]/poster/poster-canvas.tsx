"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, Download } from "lucide-react";
import QRCode from "qrcode";

type PosterPayload = {
  brandCn: string;
  brandEn: string;
  tagline: string;
  title: string;
  typeLabel: string;
  summary: string;
  excerpt: string;
  sharePath: string;
  qrPath: string;
  shareSlug: string;
};

function wrapText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines?: number,
) {
  const lines: string[] = [];

  for (const paragraph of text.split("\n")) {
    let line = "";

    for (const char of Array.from(paragraph)) {
      const nextLine = `${line}${char}`;

      if (context.measureText(nextLine).width > maxWidth && line) {
        lines.push(line);
        line = char;

        if (maxLines && lines.length >= maxLines) {
          break;
        }
      } else {
        line = nextLine;
      }
    }

    if (!maxLines || lines.length < maxLines) {
      lines.push(line);
    }

    if (maxLines && lines.length >= maxLines) {
      break;
    }
  }

  lines.forEach((line, index) => {
    context.fillText(line, x, y + index * lineHeight);
  });

  return y + lines.length * lineHeight;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();

    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Poster image load failed."));
    image.src = src;
  });
}

async function drawPoster(canvas: HTMLCanvasElement, payload: PosterPayload) {
  const width = 1080;
  const height = 1680;
  const context = canvas.getContext("2d");

  if (!context) {
    return;
  }

  canvas.width = width;
  canvas.height = height;
  const origin = window.location.origin;
  const qrUrl = `${origin}${payload.qrPath}`;
  const qrDataUrl = await QRCode.toDataURL(qrUrl, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 240,
    color: {
      dark: "#130f09",
      light: "#fbf8f0",
    },
  });
  const qrImage = await loadImage(qrDataUrl);

  context.fillStyle = "#080705";
  context.fillRect(0, 0, width, height);

  context.fillStyle = "#12100d";
  context.fillRect(70, 70, width - 140, height - 140);
  context.strokeStyle = "#c8a15a";
  context.lineWidth = 4;
  context.strokeRect(70, 70, width - 140, height - 140);
  context.strokeStyle = "#3a3023";
  context.lineWidth = 2;
  context.strokeRect(96, 96, width - 192, height - 192);

  context.fillStyle = "#f0d49a";
  context.font = '700 38px "Noto Serif SC", "Songti SC", serif';
  context.fillText(payload.brandCn, 126, 170);
  context.font = '500 22px "Inter", "PingFang SC", sans-serif';
  context.fillStyle = "#b9ad99";
  context.fillText(payload.brandEn, 126, 205);

  context.textAlign = "right";
  context.font = '500 24px "PingFang SC", sans-serif';
  context.fillStyle = "#c8a15a";
  context.fillText(payload.typeLabel, width - 126, 182);
  context.textAlign = "left";

  context.strokeStyle = "#3a3023";
  context.beginPath();
  context.moveTo(126, 250);
  context.lineTo(width - 126, 250);
  context.stroke();

  context.fillStyle = "#fff7e8";
  context.font = '700 58px "Noto Serif SC", "Songti SC", serif';
  const titleEnd = wrapText(context, payload.title, 126, 350, width - 252, 76, 3);

  context.fillStyle = "#f0d49a";
  context.font = '600 28px "PingFang SC", sans-serif';
  context.fillText(payload.tagline, 126, titleEnd + 50);

  context.fillStyle = "#1c1711";
  context.fillRect(126, titleEnd + 94, width - 252, 250);
  context.strokeStyle = "#3a3023";
  context.strokeRect(126, titleEnd + 94, width - 252, 250);

  context.fillStyle = "#d8cab2";
  context.font = '400 31px "PingFang SC", "Microsoft YaHei", sans-serif';
  const summaryEnd = wrapText(
    context,
    payload.summary,
    160,
    titleEnd + 155,
    width - 320,
    48,
    4,
  );

  context.fillStyle = "#8ad5bd";
  context.font = '600 24px "PingFang SC", sans-serif';
  context.fillText("报告节选", 126, summaryEnd + 96);

  context.fillStyle = "#b9ad99";
  context.font = '400 28px "PingFang SC", "Microsoft YaHei", sans-serif';
  wrapText(context, payload.excerpt, 126, summaryEnd + 150, width - 252, 45, 10);

  context.strokeStyle = "#3a3023";
  context.beginPath();
  context.moveTo(126, height - 285);
  context.lineTo(width - 126, height - 285);
  context.stroke();

  context.fillStyle = "#f0d49a";
  context.font = '700 30px "Noto Serif SC", "Songti SC", serif';
  context.fillText("扫码/打开链接查看完整报告", 126, height - 222);
  context.fillStyle = "#d8cab2";
  context.font = '400 25px "Inter", "PingFang SC", sans-serif';
  wrapText(context, payload.sharePath, 126, height - 176, width - 252, 38, 2);

  context.fillStyle = "#fbf8f0";
  context.fillRect(width - 366, height - 254, 240, 240);
  context.drawImage(qrImage, width - 358, height - 246, 224, 224);
  context.strokeStyle = "#c8a15a";
  context.lineWidth = 2;
  context.strokeRect(width - 366, height - 254, 240, 240);

  context.textAlign = "right";
  context.fillStyle = "#6a5431";
  context.font = '500 22px "Inter", sans-serif';
  context.fillText(payload.shareSlug, width - 126, height - 106);
  context.textAlign = "left";
}

export function PosterCanvas({ payload }: { payload: PosterPayload }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [message, setMessage] = useState("海报已生成，可下载保存。");

  useEffect(() => {
    let cancelled = false;

    if (!canvasRef.current) {
      return;
    }

    void drawPoster(canvasRef.current, payload)
      .then(() => {
        if (!cancelled) {
          setMessage("海报已生成，可下载保存。");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMessage("海报生成失败，请刷新后重试。");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [payload]);

  function track(event: string, source: string) {
    void fetch(`/api/share/${payload.shareSlug}/track`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, source }),
      keepalive: true,
    });
  }

  function downloadPoster() {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const link = document.createElement("a");
    link.download = `${payload.shareSlug}-xuanji-poster.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
    track("poster_download", "poster_page");
    setMessage("PNG 海报已下载。");
  }

  async function copyShareLink() {
    await navigator.clipboard?.writeText(`${window.location.origin}${payload.sharePath}`);
    track("copy_poster_link", "poster_page");
    setMessage("完整报告链接已复制。");
  }

  return (
    <section className="mx-auto mt-8 grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
      <div className="rounded-lg border border-[#3a3023] bg-[#12100d] p-5">
        <p className="text-sm font-semibold text-[#c8a15a]">报告海报</p>
        <h1 className="mt-3 font-ritual text-4xl leading-tight text-[#fff7e8]">
          生成适合转发的长图
        </h1>
        <p className="mt-4 text-sm leading-7 text-[#b9ad99]">
          海报只包含报告标题、摘要、节选、公开链接和二维码，不包含原始输入、图片或工具结果。
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={downloadPoster}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-[#c8a15a] px-4 text-sm font-semibold text-[#130f09] transition hover:bg-[#f0d49a]"
          >
            <Download size={16} aria-hidden="true" />
            下载 PNG
          </button>
          <button
            type="button"
            onClick={copyShareLink}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-[#6a5431] px-4 text-sm text-[#fff7e8] transition hover:border-[#c8a15a]"
          >
            <Copy size={16} aria-hidden="true" />
            复制报告链接
          </button>
        </div>
        <p className="mt-4 text-xs text-[#b9ad99]">{message}</p>
      </div>
      <div className="rounded-lg border border-[#3a3023] bg-[#12100d] p-3">
        <canvas
          ref={canvasRef}
          className="h-auto w-full rounded-md border border-[#2f261a] bg-[#080705]"
          aria-label="玄机 AI 报告分享海报预览"
        />
      </div>
    </section>
  );
}
