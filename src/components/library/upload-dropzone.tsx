"use client";

import { CloudUpload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

/** Client mirror of the server allowlist, for the file picker only. */
const ACCEPT =
  ".pdf,.docx,.pptx,.png,.jpg,.jpeg,.webp,.md,.markdown,.txt,.text";

type Upload = {
  id: string;
  name: string;
  status: "uploading" | "done" | "error";
  message?: string;
};

export function UploadDropzone({
  classId,
  folderId,
}: {
  classId?: string | null;
  folderId?: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploads, setUploads] = useState<Upload[]>([]);
  // Drag events fire for child elements too; count enter/leave to avoid the
  // highlight flickering as the pointer crosses inner nodes.
  const dragDepth = useRef(0);

  const uploadFile = useCallback(
    async (file: File) => {
      const id = `${file.name}-${Date.now()}-${Math.random()}`;
      setUploads((current) => [
        ...current,
        { id, name: file.name, status: "uploading" },
      ]);

      const body = new FormData();
      body.append("file", file);
      if (classId) body.append("classId", classId);
      if (folderId) body.append("folderId", folderId);

      try {
        const response = await fetch("/api/documents", {
          method: "POST",
          body,
        });
        const payload = (await response.json()) as {
          error?: string;
        };

        if (!response.ok) {
          setUploads((current) =>
            current.map((upload) =>
              upload.id === id
                ? {
                    ...upload,
                    status: "error",
                    message: payload.error ?? "Upload failed.",
                  }
                : upload,
            ),
          );
          return;
        }

        setUploads((current) =>
          current.map((upload) =>
            upload.id === id ? { ...upload, status: "done" } : upload,
          ),
        );
        router.refresh();
      } catch {
        setUploads((current) =>
          current.map((upload) =>
            upload.id === id
              ? {
                  ...upload,
                  status: "error",
                  message: "Network error. Check your connection.",
                }
              : upload,
          ),
        );
      }
    },
    [classId, folderId, router],
  );

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      // Sequential rather than parallel: keeps memory bounded and gives the
      // server's per-user rate limit a fair chance to apply predictably.
      for (const file of Array.from(files)) {
        await uploadFile(file);
      }
    },
    [uploadFile],
  );

  const active = uploads.filter((upload) => upload.status === "uploading");
  const failed = uploads.filter((upload) => upload.status === "error");

  return (
    <div className="space-y-3">
      <div
        onDragEnter={(event) => {
          event.preventDefault();
          dragDepth.current += 1;
          setDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          dragDepth.current -= 1;
          if (dragDepth.current <= 0) setDragging(false);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          dragDepth.current = 0;
          setDragging(false);
          void handleFiles(event.dataTransfer.files);
        }}
        className={cn(
          "rounded-lg border border-dashed p-6 text-center transition-colors",
          dragging ? "border-primary bg-primary/5" : "border-border",
        )}
      >
        <CloudUpload
          className="text-muted-foreground mx-auto mb-2 size-6"
          aria-hidden
        />
        <p className="text-sm font-medium">Drop files here</p>
        <p className="text-muted-foreground mt-1 text-xs">
          PDF, Word, PowerPoint, images, or notes — up to 25 MB each
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={() => inputRef.current?.click()}
        >
          Choose files
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="sr-only"
          aria-label="Choose files to upload"
          onChange={(event) => {
            void handleFiles(event.target.files);
            // Reset so re-selecting the same file fires change again.
            event.target.value = "";
          }}
        />
      </div>

      {active.length > 0 ? (
        <div className="space-y-2" aria-live="polite">
          {active.map((upload) => (
            <div key={upload.id} className="space-y-1">
              <p className="text-muted-foreground truncate text-xs">
                Uploading {upload.name}…
              </p>
              <Progress value={undefined} className="h-1" />
            </div>
          ))}
        </div>
      ) : null}

      {failed.length > 0 ? (
        <ul className="space-y-2" aria-live="assertive">
          {failed.map((upload) => (
            <li
              key={upload.id}
              className="border-destructive/40 bg-destructive/10 flex items-start gap-2 rounded-md border px-3 py-2 text-xs"
            >
              <span className="min-w-0 flex-1">
                <span className="font-medium">{upload.name}</span>
                <span className="text-destructive block">{upload.message}</span>
              </span>
              <button
                type="button"
                aria-label={`Dismiss error for ${upload.name}`}
                onClick={() =>
                  setUploads((current) =>
                    current.filter((item) => item.id !== upload.id),
                  )
                }
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
