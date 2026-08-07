"use client";

import { Mail, Trash2, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CAPABILITY_LABELS, MEMBER_CAPABILITIES } from "@/lib/validations/team";
import {
  inviteMemberAction,
  removeMemberAction,
  revokeInvitationAction,
  updateMemberAction,
} from "@/server/businesses/team-actions";

type Role = "OWNER" | "ADMIN" | "MEMBER";
type Capability = (typeof MEMBER_CAPABILITIES)[number];

export type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: Role;
  capabilities: Capability[];
  isSelf: boolean;
};

export type PendingInvite = {
  id: string;
  email: string;
  role: Role;
  expiresAt: string;
};

const ROLE_LABEL: Record<Role, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MEMBER: "Member",
};

export function TeamManager({
  members,
  invitations,
  seatsInUse,
  seatLimit,
  canManage,
}: {
  members: TeamMember[];
  invitations: PendingInvite[];
  seatsInUse: number;
  seatLimit: number;
  /** Only OWNER and ADMIN see the controls. */
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const seatsLeft = seatLimit - seatsInUse;

  function refresh() {
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {canManage ? (
        <InviteForm
          seatsLeft={seatsLeft}
          seatLimit={seatLimit}
          pending={pending}
          onInvite={(input, done) =>
            startTransition(async () => {
              const result = await inviteMemberAction(input);
              if (result.ok) {
                toast.success(`Invitation sent to ${input.email}.`);
                done();
                refresh();
              } else {
                toast.error(result.error);
              }
            })
          }
        />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Team ({members.length})</CardTitle>
          <CardDescription>
            {seatsInUse} of {seatLimit} seats in use.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="divide-border divide-y">
            {members.map((member) => (
              <li key={member.id} className="py-3 first:pt-0 last:pb-0">
                <MemberRow
                  member={member}
                  canManage={canManage}
                  pending={pending}
                  onChange={(changes) =>
                    startTransition(async () => {
                      const result = await updateMemberAction(
                        member.id,
                        changes,
                      );
                      if (result.ok) {
                        toast.success("Teammate updated.");
                        refresh();
                      } else {
                        toast.error(result.error);
                      }
                    })
                  }
                  onRemove={() =>
                    startTransition(async () => {
                      const result = await removeMemberAction(member.id);
                      if (result.ok) {
                        toast.success(`${member.name} removed.`);
                        refresh();
                      } else {
                        toast.error(result.error);
                      }
                    })
                  }
                />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {invitations.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Pending invitations ({invitations.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-border divide-y">
              {invitations.map((invite) => (
                <li
                  key={invite.id}
                  className="flex flex-wrap items-center gap-3 py-2.5 text-sm first:pt-0 last:pb-0"
                >
                  <Mail
                    className="text-muted-foreground size-4 shrink-0"
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {invite.email}
                  </span>
                  <Badge variant="secondary">{ROLE_LABEL[invite.role]}</Badge>
                  {canManage ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          const result = await revokeInvitationAction(
                            invite.id,
                          );
                          if (result.ok) {
                            toast.success("Invitation revoked.");
                            refresh();
                          } else {
                            toast.error(result.error);
                          }
                        })
                      }
                    >
                      Revoke
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function InviteForm({
  seatsLeft,
  seatLimit,
  pending,
  onInvite,
}: {
  seatsLeft: number;
  seatLimit: number;
  pending: boolean;
  onInvite: (
    input: { email: string; role: Role; capabilities: Capability[] },
    done: () => void,
  ) => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"ADMIN" | "MEMBER">("MEMBER");
  const [capabilities, setCapabilities] = useState<Capability[]>([]);

  const full = seatsLeft <= 0;

  function toggle(capability: Capability) {
    setCapabilities((current) =>
      current.includes(capability)
        ? current.filter((value) => value !== capability)
        : [...current, capability],
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Invite a teammate</CardTitle>
        <CardDescription>
          {full
            ? seatLimit === 1
              ? "Your plan includes a single seat. Upgrade to add teammates."
              : "Every seat on your plan is in use."
            : `${seatsLeft} seat${seatsLeft === 1 ? "" : "s"} available.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <div className="space-y-2">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="teammate@example.com"
              maxLength={254}
              disabled={full}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="invite-role">Role</Label>
            <Select
              value={role}
              onValueChange={(value) => setRole(value as "ADMIN" | "MEMBER")}
              disabled={full}
            >
              <SelectTrigger id="invite-role" className="sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MEMBER">Member</SelectItem>
                <SelectItem value="ADMIN">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {role === "MEMBER" ? (
          <fieldset className="space-y-2" disabled={full}>
            <legend className="text-sm font-medium">What can they do?</legend>
            <p className="text-muted-foreground text-xs">
              Admins can do everything. Members do only what you allow.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {MEMBER_CAPABILITIES.map((capability) => (
                <label
                  key={capability}
                  className="hover:bg-accent/50 flex cursor-pointer items-start gap-2 rounded-md border p-2.5"
                >
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={capabilities.includes(capability)}
                    onChange={() => toggle(capability)}
                  />
                  <span className="text-sm">
                    <span className="font-medium">
                      {CAPABILITY_LABELS[capability].title}
                    </span>
                    <span className="text-muted-foreground block text-xs">
                      {CAPABILITY_LABELS[capability].description}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : (
          <p className="text-muted-foreground text-sm">
            Admins can manage everything except billing and ownership.
          </p>
        )}

        <Button
          disabled={full || pending || email.trim() === ""}
          onClick={() =>
            onInvite(
              {
                email: email.trim(),
                role,
                capabilities: role === "MEMBER" ? capabilities : [],
              },
              () => {
                setEmail("");
                setCapabilities([]);
              },
            )
          }
        >
          <UserPlus className="size-4" aria-hidden />
          Send invitation
        </Button>
      </CardContent>
    </Card>
  );
}

function MemberRow({
  member,
  canManage,
  pending,
  onChange,
  onRemove,
}: {
  member: TeamMember;
  canManage: boolean;
  pending: boolean;
  onChange: (changes: { role?: Role; capabilities?: Capability[] }) => void;
  onRemove: () => void;
}) {
  // The owner and your own row are never editable here.
  const editable = canManage && member.role !== "OWNER" && !member.isSelf;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 font-medium">
            {member.name}
            {member.isSelf ? (
              <span className="text-muted-foreground text-xs">(you)</span>
            ) : null}
          </p>
          <p className="text-muted-foreground truncate text-sm">
            {member.email}
          </p>
        </div>
        <Badge variant={member.role === "OWNER" ? "default" : "secondary"}>
          {ROLE_LABEL[member.role]}
        </Badge>
        {editable ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Remove ${member.name}`}
            disabled={pending}
            onClick={onRemove}
          >
            <Trash2 className="size-4" aria-hidden />
          </Button>
        ) : null}
      </div>

      {editable && member.role === "MEMBER" ? (
        <div className="flex flex-wrap gap-1.5">
          {MEMBER_CAPABILITIES.map((capability) => {
            const granted = member.capabilities.includes(capability);
            return (
              <button
                key={capability}
                type="button"
                disabled={pending}
                aria-pressed={granted}
                onClick={() =>
                  onChange({
                    capabilities: granted
                      ? member.capabilities.filter((c) => c !== capability)
                      : [...member.capabilities, capability],
                  })
                }
                className={
                  granted
                    ? "bg-primary text-primary-foreground rounded-full px-2.5 py-0.5 text-xs"
                    : "text-muted-foreground hover:bg-accent rounded-full border px-2.5 py-0.5 text-xs"
                }
              >
                {CAPABILITY_LABELS[capability].title}
              </button>
            );
          })}
        </div>
      ) : member.role === "MEMBER" && member.capabilities.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {member.capabilities.map((capability) => (
            <span
              key={capability}
              className="bg-secondary text-secondary-foreground rounded-full px-2.5 py-0.5 text-xs"
            >
              {CAPABILITY_LABELS[capability].title}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
