"use client";

import { FileText, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatBytes } from "@/lib/format";
import { deleteDocumentAction } from "@/server/businesses/actions";

type DocumentRow = {
  id: string;
  kind: "LICENCE" | "INSURANCE" | "OTHER";
  title: string;
  sizeBytes: number;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reviewNote: string | null;
  expiresAt: string | null;
};

const KIND_LABEL = {
  LICENCE: "Licence",
  INSURANCE: "Insurance",
  OTHER: "Other",
} as const;

const STATUS_VARIANT = {
  PENDING: "secondary",
  APPROVED: "default",
  REJECTED: "destructive",
} as const;

const STATUS_LABEL = {
  PENDING: "In review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
} as const;

export function DocumentManager({
  documents,
  accept,
}: {
  documents: DocumentRow[];
  accept: string;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<DocumentRow["kind"]>("LICENCE");
  const [expiresAt, setExpiresAt] = useState("");
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();

  async function handleUpload(event: React.FormEvent) {
    event.preventDefault();
    const file = fileInput.current?.files?.[0];
    if (!file) return;

    const body = new FormData();
    body.set("file", file);
    body.set("kind", kind);
    if (expiresAt) body.set("expiresAt", expiresAt);

    setUploading(true);
    try {
      const response = await fetch("/api/documents", { method: "POST", body });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        toast.error(payload.error ?? "Upload failed.");
        return;
      }
      toast.success("Uploaded — we'll review it shortly.");
      if (fileInput.current) fileInput.current.value = "";
      setExpiresAt("");
      router.refresh();
    } catch {
      toast.error("Upload failed. Check your connection and try again.");
    } finally {
      setUploading(false);
    }
  }

  function handleDelete(document: DocumentRow) {
    startTransition(async () => {
      const result = await deleteDocumentAction(document.id);
      if (result.ok) {
        toast.success("Removed.");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Licence &amp; insurance</CardTitle>
        <CardDescription>
          We verify these before your storefront goes live. PDFs or clear photos
          only — they&apos;re never shown publicly.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {documents.length > 0 ? (
          <ul className="divide-border divide-y rounded-md border">
            {documents.map((document) => (
              <li
                key={document.id}
                className="flex items-center gap-3 px-3 py-2.5 text-sm"
              >
                <FileText
                  className="text-muted-foreground size-4 shrink-0"
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <a
                    href={`/api/documents/${document.id}`}
                    className="block truncate font-medium hover:underline"
                  >
                    {document.title}
                  </a>
                  <p className="text-muted-foreground text-xs">
                    {KIND_LABEL[document.kind]} ·{" "}
                    {formatBytes(document.sizeBytes)}
                    {document.expiresAt
                      ? ` · expires ${document.expiresAt}`
                      : ""}
                  </p>
                  {document.status === "REJECTED" && document.reviewNote ? (
                    <p className="text-destructive mt-1 text-xs">
                      {document.reviewNote}
                    </p>
                  ) : null}
                </div>
                <Badge variant={STATUS_VARIANT[document.status]}>
                  {STATUS_LABEL[document.status]}
                </Badge>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${document.title}`}
                  disabled={pending}
                  onClick={() => handleDelete(document)}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">
            Nothing uploaded yet. Add your trade licence and a certificate of
            insurance.
          </p>
        )}

        <form onSubmit={handleUpload} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="document-kind">Document type</Label>
              <Select
                value={kind}
                onValueChange={(value) => setKind(value as DocumentRow["kind"])}
              >
                <SelectTrigger id="document-kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="LICENCE">Licence</SelectItem>
                  <SelectItem value="INSURANCE">Insurance</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="document-expiry">Expires (optional)</Label>
              <Input
                id="document-expiry"
                type="date"
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="document-file">File</Label>
              <Input
                id="document-file"
                type="file"
                ref={fileInput}
                accept={accept}
                required
              />
            </div>
          </div>
          <Button type="submit" variant="outline" disabled={uploading}>
            <Upload className="size-4" aria-hidden />
            {uploading ? "Uploading…" : "Upload document"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
