"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ClassSummary } from "@/server/library/classes";
import type { FolderSummary } from "@/server/library/folders";
import { moveDocumentAction } from "@/server/library/actions";

/** Sentinel for "no class"/"no folder"; Radix Select cannot hold an empty value. */
const NONE = "__none__";

export function MoveDialog({
  open,
  onOpenChange,
  documentId,
  documentTitle,
  currentClassId,
  currentFolderId,
  classes,
  folders,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: string;
  documentTitle: string;
  currentClassId: string | null;
  currentFolderId: string | null;
  classes: ClassSummary[];
  folders: FolderSummary[];
}) {
  const [classId, setClassId] = useState(currentClassId ?? NONE);
  const [folderId, setFolderId] = useState(currentFolderId ?? NONE);
  const [pending, startTransition] = useTransition();

  // Re-sync when reopened for a different document (see RenameDialog).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setClassId(currentClassId ?? NONE);
      setFolderId(currentFolderId ?? NONE);
    }
  }

  // Only folders in the chosen class are valid destinations.
  const availableFolders = folders.filter((folder) =>
    classId === NONE ? !folder.classId : folder.classId === classId,
  );

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await moveDocumentAction({
        id: documentId,
        classId: classId === NONE ? null : classId,
        folderId: folderId === NONE ? null : folderId,
      });
      if (result.ok) {
        toast.success("Document moved.");
        onOpenChange(false);
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Move document</DialogTitle>
            <DialogDescription className="truncate">
              {documentTitle}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="move-class">Class</Label>
              <Select
                value={classId}
                onValueChange={(value) => {
                  setClassId(value);
                  // A folder from the old class would no longer be valid.
                  setFolderId(NONE);
                }}
              >
                <SelectTrigger id="move-class" className="w-full">
                  <SelectValue placeholder="No class" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No class</SelectItem>
                  {classes.map((klass) => (
                    <SelectItem key={klass.id} value={klass.id}>
                      {klass.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {availableFolders.length > 0 ? (
              <div className="space-y-2">
                <Label htmlFor="move-folder">Folder</Label>
                <Select value={folderId} onValueChange={setFolderId}>
                  <SelectTrigger id="move-folder" className="w-full">
                    <SelectValue placeholder="No folder" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>No folder</SelectItem>
                    {availableFolders.map((folder) => (
                      <SelectItem key={folder.id} value={folder.id}>
                        {folder.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Moving…" : "Move"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
