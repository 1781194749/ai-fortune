"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Copy, Gift } from "lucide-react";

type InviteCopyButtonProps = {
  inviteUrl?: string;
  fallbackHref?: string;
  label?: string;
  copiedLabel?: string;
  className: string;
  iconClassName?: string;
};

export function InviteCopyButton({
  inviteUrl,
  fallbackHref = "/login",
  label = "邀请有礼",
  copiedLabel = "已复制",
  className,
  iconClassName,
}: InviteCopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function copyInviteUrl() {
    if (!inviteUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  const content = (
    <>
      {copied ? (
        <Check size={16} className={iconClassName} aria-hidden="true" />
      ) : inviteUrl ? (
        <Copy size={16} className={iconClassName} aria-hidden="true" />
      ) : (
        <Gift size={16} className={iconClassName} aria-hidden="true" />
      )}
      {copied ? copiedLabel : label}
    </>
  );

  if (!inviteUrl) {
    return (
      <Link href={fallbackHref} className={className}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={copyInviteUrl} className={className}>
      {content}
    </button>
  );
}
