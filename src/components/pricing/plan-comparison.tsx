import { Check, Minus, Zap } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  PLANS,
  PLAN_FEATURES,
  type FeatureStatus,
  type PlanFeature,
} from "@/lib/plans";
import { cn } from "@/lib/utils";

function Cell({
  status,
  text,
}: {
  status: FeatureStatus | false;
  text?: string;
}) {
  if (text) {
    return <span className="text-sm font-medium">{text}</span>;
  }
  if (status === false) {
    return (
      <>
        <Minus className="text-muted-foreground/50 size-4" aria-hidden />
        <span className="sr-only">Not included</span>
      </>
    );
  }
  if (status === "soon") {
    return (
      <Badge variant="secondary" className="text-[11px] font-normal">
        Soon
      </Badge>
    );
  }
  return (
    <>
      <Check className="size-4 text-emerald-500" aria-hidden />
      <span className="sr-only">Included</span>
    </>
  );
}

/**
 * Feature grid.
 *
 * A real `<table>` rather than a grid of divs: this is tabular data, and a
 * screen reader announcing "Granular permissions, Roost Pro, not included"
 * only works if the row and column headers are real headers.
 *
 * Anything not yet built is marked "Soon" rather than ticked. A pricing page
 * that implies capability the product lacks is the one kind of bug tests
 * cannot catch.
 */
export function PlanComparison() {
  const rows = [
    ...PLAN_FEATURES.filter((feature) => feature.headline),
    ...PLAN_FEATURES.filter((feature) => !feature.headline),
  ];

  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[36rem] border-collapse text-left">
        <caption className="sr-only">
          Feature comparison between Roost Pro and Roost Premium
        </caption>
        <thead>
          <tr className="border-b">
            <th
              scope="col"
              className="text-muted-foreground px-4 py-4 text-xs font-medium tracking-wide uppercase"
            >
              Feature
            </th>
            {PLANS.map((plan) => (
              <th
                key={plan.id}
                scope="col"
                className={cn(
                  "w-40 px-4 py-4 text-center text-sm font-semibold",
                  plan.featured && "bg-primary/5",
                )}
              >
                {plan.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((feature: PlanFeature) => (
            <tr key={feature.label} className="border-b last:border-0">
              <th
                scope="row"
                className={cn(
                  "px-4 py-3.5 text-sm font-normal",
                  feature.headline && "bg-muted/40 font-medium",
                )}
              >
                <span className="flex items-start gap-2">
                  {feature.headline ? (
                    <Zap
                      className="mt-0.5 size-4 shrink-0 text-emerald-500"
                      aria-hidden
                    />
                  ) : null}
                  {feature.label}
                </span>
              </th>
              <td
                className={cn(
                  "px-4 py-3.5 text-center",
                  feature.headline && "bg-muted/40",
                )}
              >
                <span className="inline-flex items-center justify-center">
                  <Cell status={feature.pro} text={feature.proText} />
                </span>
              </td>
              <td
                className={cn(
                  "px-4 py-3.5 text-center",
                  plansFeaturedBackground(feature.headline),
                )}
              >
                <span className="inline-flex items-center justify-center">
                  <Cell status={feature.premium} text={feature.premiumText} />
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Premium's column keeps its tint, a shade stronger on headline rows. */
function plansFeaturedBackground(headline?: boolean): string {
  return headline ? "bg-primary/10" : "bg-primary/5";
}
