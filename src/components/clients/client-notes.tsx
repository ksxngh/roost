"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  setClientArchivedAction,
  setClientNotesAction,
} from "@/server/businesses/client-actions";

export function ClientNotes({
  clientId,
  notes,
  archived,
}: {
  clientId: string;
  notes: string | null;
  archived: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await setClientNotesAction(clientId, value);
      if (result.ok) toast.success("Notes saved.");
      else setError(result.error);
    });
  }

  function handleArchive() {
    startTransition(async () => {
      const result = await setClientArchivedAction(clientId, !archived);
      if (result.ok) {
        toast.success(archived ? "Client restored." : "Client archived.");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Private notes</CardTitle>
        <CardDescription>
          Only your team sees this. Gate codes, dogs, who to ask for.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          aria-label="Private notes"
          rows={4}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          maxLength={2000}
          placeholder="Side gate is stiff. Ask for Dana, not the tenant."
        />
        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        ) : null}
      </CardContent>
      <CardFooter className="gap-2">
        <Button onClick={handleSave} disabled={pending}>
          {pending ? "Saving…" : "Save notes"}
        </Button>
        {/* Archiving hides the client without touching the invoices and
            bookings attached to them, which are financial records. */}
        <Button variant="ghost" onClick={handleArchive} disabled={pending}>
          {archived ? "Restore client" : "Archive client"}
        </Button>
      </CardFooter>
    </Card>
  );
}
