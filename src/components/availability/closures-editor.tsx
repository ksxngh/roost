"use client";

import { CalendarOff, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addExceptionAction,
  removeExceptionAction,
} from "@/server/businesses/actions";

export type ClosureRow = { id: string; date: string; note: string | null };

export function ClosuresEditor({ closures }: { closures: ClosureRow[] }) {
  const router = useRouter();
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await addExceptionAction({
        date,
        note: note.trim() || null,
      });
      if (result.ok) {
        setDate("");
        setNote("");
        toast.success("Day marked closed.");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleRemove(closure: ClosureRow) {
    startTransition(async () => {
      const result = await removeExceptionAction(closure.id);
      if (result.ok) {
        toast.success("Day reopened.");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Days off</CardTitle>
        <CardDescription>
          Holidays and vacation. These override your weekly hours entirely.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {closures.length > 0 ? (
          <ul className="divide-border divide-y rounded-md border">
            {closures.map((closure) => (
              <li
                key={closure.id}
                className="flex items-center gap-3 px-3 py-2 text-sm"
              >
                <CalendarOff
                  className="text-muted-foreground size-4 shrink-0"
                  aria-hidden
                />
                <span className="font-medium">{closure.date}</span>
                {closure.note ? (
                  <span className="text-muted-foreground truncate">
                    {closure.note}
                  </span>
                ) : null}
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-auto"
                  aria-label={`Reopen ${closure.date}`}
                  disabled={pending}
                  onClick={() => handleRemove(closure)}
                >
                  <X className="size-4" aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">
            No days off scheduled.
          </p>
        )}

        <form onSubmit={handleAdd} className="flex flex-col gap-2 sm:flex-row">
          <div className="space-y-2 sm:w-48">
            <Label htmlFor="closure-date">Date</Label>
            <Input
              id="closure-date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </div>
          <div className="flex-1 space-y-2">
            <Label htmlFor="closure-note">Reason (optional)</Label>
            <Input
              id="closure-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Statutory holiday"
              maxLength={140}
            />
          </div>
          <div className="flex items-end">
            <Button type="submit" variant="outline" disabled={pending || !date}>
              <Plus className="size-4" aria-hidden />
              Add
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
