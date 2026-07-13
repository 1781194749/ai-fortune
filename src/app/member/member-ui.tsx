import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, type LucideIcon } from "lucide-react";

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: { href: string; label: string; icon?: LucideIcon };
}) {
  const ActionIcon = action?.icon;

  return (
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
      <div>
        <p className="text-xs text-[#697386]">{eyebrow}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#f4efe5]">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#8d98a8]">{description}</p>
      </div>
      {action ? (
        <Link
          href={action.href}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-[#c9a35f] px-3 text-sm font-medium text-[#17130d] transition hover:bg-[#efd9a6]"
        >
          {ActionIcon ? <ActionIcon size={15} aria-hidden="true" /> : null}
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}

export function MetricCard({
  label,
  value,
  suffix,
  detail,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  suffix?: string;
  detail: string;
  icon: LucideIcon;
}) {
  return (
    <article className="rounded-lg border border-[#252a32] bg-[#101318] p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-[#8d98a8]">{label}</p>
        <Icon size={16} className="text-[#c9a35f]" aria-hidden="true" />
      </div>
      <p className="mt-3 flex items-end gap-1.5">
        <span className="text-2xl font-semibold tracking-tight text-[#f4efe5]">{value}</span>
        {suffix ? <span className="pb-0.5 text-xs text-[#8d98a8]">{suffix}</span> : null}
      </p>
      <p className="mt-2 truncate text-xs text-[#697386]">{detail}</p>
    </article>
  );
}

export function Panel({
  title,
  description,
  icon: Icon,
  children,
}: {
  title: string;
  description: string;
  icon?: LucideIcon;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-lg border border-[#252a32] bg-[#101318]">
      <div className="flex items-center justify-between border-b border-[#252a32] px-5 py-4">
        <div>
          <h2 className="font-semibold text-[#f4efe5]">{title}</h2>
          <p className="mt-1 text-xs text-[#697386]">{description}</p>
        </div>
        {Icon ? <Icon size={18} className="text-[#8d98a8]" aria-hidden="true" /> : null}
      </div>
      {children}
    </section>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  action,
}: {
  icon: LucideIcon;
  title: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="flex min-h-36 flex-col items-center justify-center rounded-lg border border-dashed border-[#303642] bg-[#0b0d11] px-4 py-8 text-center">
      <Icon size={22} className="text-[#6f7a8a]" aria-hidden="true" />
      <p className="mt-3 text-sm text-[#b9c0cb]">{title}</p>
      {action ? (
        <Link href={action.href} className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-[#d8b873] transition hover:text-[#efd9a6]">
          {action.label}
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}
