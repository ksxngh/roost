import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Labeled input with inline validation message, wired for react-hook-form
 * via spread `registration`. Error text is linked with aria-describedby so
 * screen readers announce it with the field.
 */
export function FormField({
  id,
  label,
  error,
  className,
  labelAside,
  ...inputProps
}: {
  id: string;
  label: string;
  error?: string;
  /** Optional element rendered to the right of the label (e.g. a help link). */
  labelAside?: React.ReactNode;
  className?: string;
} & React.ComponentProps<typeof Input>) {
  const errorId = `${id}-error`;
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>{label}</Label>
        {labelAside}
      </div>
      <Input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        {...inputProps}
      />
      {error ? (
        <p id={errorId} role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
