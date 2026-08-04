"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Label } from "@/components/ui/label";
import { assignBookingAction } from "@/server/businesses/booking-actions";

export type AssignableMember = { id: string; name: string };

const UNASSIGNED = "__unassigned__";

/**
 * Assign a job to a team member.
 *
 * A plain `<select>` rather than a Radix combobox: this sits inside a dense
 * list, it has no search or multi-select needs, and the native control is
 * what a phone renders best on a driveway.
 */
export function AssignPicker({
  bookingId,
  members,
  assignedToId,
}: {
  bookingId: string;
  members: AssignableMember[];
  assignedToId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const selectId = `assign-${bookingId}`;

  // A solo business has nothing to choose between.
  if (members.length < 2) return null;

  function handleChange(value: string) {
    startTransition(async () => {
      const result = await assignBookingAction(
        bookingId,
        value === UNASSIGNED ? null : value,
      );
      if (result.ok) {
        toast.success("Assignment updated.");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Label htmlFor={selectId} className="text-muted-foreground text-xs">
        Assigned to
      </Label>
      <select
        id={selectId}
        value={assignedToId ?? UNASSIGNED}
        disabled={pending}
        onChange={(event) => handleChange(event.target.value)}
        className="border-input bg-background h-8 rounded-md border px-2 text-xs"
      >
        <option value={UNASSIGNED}>Unassigned</option>
        {members.map((member) => (
          <option key={member.id} value={member.id}>
            {member.name}
          </option>
        ))}
      </select>
    </div>
  );
}
