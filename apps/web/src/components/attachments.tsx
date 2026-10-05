"use client";

import { FileArchive, FileImage, FileSpreadsheet, FileText, File as FileIcon, Trash2, type LucideIcon } from "lucide-react";
import type { AttachmentDto } from "@plano/shared";
import { fileUrl } from "@/lib/api";
import { IconButton } from "./ui";
import { t } from "@plano/shared";
export const isImage = (a: { mime: string }) => /^image\/(png|jpe?g|gif|webp|avif)$/.test(a.mime);

export function formatSize(bytes: number) {
  if (bytes < 1024) return t("attachments.b", { bytes });
  if (bytes < 1024 * 1024) return t("attachments.kb", { round: Math.round(bytes / 1024) });
  return t("attachments.mb", { toFixed: (bytes / 1024 / 1024).toFixed(1).replace(".", ",") });
}

function iconFor(a: { mime: string; name: string }): LucideIcon {
  if (isImage(a)) return FileImage;
  if (/sheet|excel|csv/.test(a.mime) || /\.(xlsx?|csv)$/i.test(a.name)) return FileSpreadsheet;
  if (/zip|rar|7z|tar|gzip/.test(a.mime)) return FileArchive;
  if (/pdf|word|text|document/.test(a.mime)) return FileText;
  return FileIcon;
}

// Card-level file grid: image thumbnails and file tiles.
export function AttachmentGrid({
  items,
  canDelete,
  onDelete,
}: {
  items: AttachmentDto[];
  canDelete: (a: AttachmentDto) => boolean;
  onDelete: (a: AttachmentDto) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
      {items.map((a) => {
        const Icon = iconFor(a);
        return (
          <div key={a.id} className="group relative overflow-hidden rounded-lg border border-border bg-surface transition-colors hover:border-border-strong">
            <a href={fileUrl(a.url)} target="_blank" rel="noreferrer" title={a.name} className="block">
              {isImage(a) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={fileUrl(a.url)} alt={a.name} loading="lazy" className="h-24 w-full bg-surface-soft object-cover" />
              ) : (
                <span className="grid h-24 place-items-center bg-surface-soft text-ink-ghost">
                  <Icon size={28} strokeWidth={1.5} />
                </span>
              )}
              <span className="block px-2.5 py-1.5">
                <span className="block truncate text-sm">{a.name}</span>
                <span className="block text-xs text-ink-ghost">
                  {formatSize(a.size)}
                  {a.commentId ? t("attachments.fromTheDiscussion") : ""}
                </span>
              </span>
            </a>
            {canDelete(a) && (
              <IconButton
                size="sm"
                title={t("attachments.deleteFile")}
                onClick={() => onDelete(a)}
                className="absolute right-1 top-1 bg-surface/90 opacity-0 shadow-card group-hover:opacity-100 focus:opacity-100"
              >
                <Trash2 size={13} />
              </IconButton>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Files inside a chat bubble.
export function MessageAttachments({ items, mine }: { items: AttachmentDto[]; mine?: boolean }) {
  if (!items.length) return null;
  const images = items.filter(isImage);
  const files = items.filter((a) => !isImage(a));
  return (
    <div className="mt-1 space-y-1">
      {images.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {images.map((a) => (
            <a key={a.id} href={fileUrl(a.url)} target="_blank" rel="noreferrer" title={a.name}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fileUrl(a.url)} alt={a.name} loading="lazy" className="max-h-44 max-w-[220px] rounded-lg object-cover" />
            </a>
          ))}
        </div>
      )}
      {files.map((a) => {
        const Icon = iconFor(a);
        return (
          <a
            key={a.id}
            href={fileUrl(a.url)}
            target="_blank"
            rel="noreferrer"
            className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${mine ? "bg-white/15 hover:bg-white/25" : "bg-surface-soft hover:bg-surface-sunken"}`}
          >
            <Icon size={16} strokeWidth={1.75} className="shrink-0" />
            <span className="min-w-0 flex-1 truncate">{a.name}</span>
            <span className={`shrink-0 text-xs ${mine ? "text-white/70" : "text-ink-ghost"}`}>{formatSize(a.size)}</span>
          </a>
        );
      })}
    </div>
  );
}
