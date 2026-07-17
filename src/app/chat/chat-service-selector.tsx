"use client";

import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  chatServiceModes,
  getChatServiceMode,
  isChatServiceMode,
  type ChatServiceMode,
} from "@/lib/chat-service";

export function ChatServiceSelector({
  mode,
  onModeChange,
}: {
  mode: ChatServiceMode;
  onModeChange: (mode: ChatServiceMode) => void;
}) {
  const selected = getChatServiceMode(mode);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="group flex h-9 shrink-0 items-center gap-1 rounded-lg px-2 text-[11px] font-medium text-[#aaa294] outline-none transition hover:bg-[#1d1e19] hover:text-[#eee6d8] focus-visible:ring-1 focus-visible:ring-[#c9a35f]/55 data-[state=open]:bg-[#1d1e19] data-[state=open]:text-[#eee6d8]"
          aria-label={`选择问事模式，当前${selected.label}，预计 ${selected.cost} 星力`}
        >
          <span>{selected.label}</span>
          <span className="text-[#5f5b53]">·</span>
          <span className="text-[#c9a35f]">{selected.cost} 星力</span>
          <ChevronDown
            size={13}
            className="ml-0.5 text-[#777168] transition-transform group-data-[state=open]:rotate-180"
            aria-hidden="true"
          />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        side="top"
        align="end"
        sideOffset={8}
        className="w-[min(310px,calc(100vw-24px))] border border-[#34352e] bg-[#141510] p-1.5 text-[#d5cdbf] shadow-[0_18px_48px_rgba(0,0,0,0.48)]"
      >
        <div className="px-2 pb-1.5 pt-1 text-[10px] text-[#777168]">选择本次问事方式</div>
        <DropdownMenuRadioGroup
          value={mode}
          onValueChange={(value) => {
            if (isChatServiceMode(value)) {
              onModeChange(value);
            }
          }}
        >
          {chatServiceModes.map((item) => (
            <DropdownMenuRadioItem
              key={item.id}
              value={item.id}
              className="min-h-12 cursor-pointer rounded-md px-2 py-2 pr-8 text-[#aaa294] outline-none focus:bg-[#24231c] focus:text-[#eee6d8] data-[state=checked]:bg-[#201f19] data-[state=checked]:text-[#eee6d8] [&_[data-slot=dropdown-menu-radio-item-indicator]]:text-[#d8b873]"
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-3">
                  <span className="text-xs font-medium">{item.label}</span>
                  <span className="shrink-0 text-[10px] text-[#c9a35f]">{item.cost} 星力</span>
                </span>
                <span className="mt-0.5 block truncate text-[10px] text-[#716b62]">
                  {item.description} · {item.output}
                </span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
