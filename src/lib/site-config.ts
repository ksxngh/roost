/**
 * Product identity and navigation. Every surface (metadata, shells, marketing)
 * reads from here, so a rename or nav change is a one-file edit.
 */
import {
  CalendarDays,
  CalendarRange,
  FileText,
  LayoutDashboard,
  Receipt,
  Settings,
  Store,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export const siteConfig = {
  name: "Roost",
  /** Shown to homeowners on the marketplace. */
  description:
    "Book trusted local home services at upfront prices — or run and grow your service business on one platform.",
  /** Shown to providers on the business side. */
  businessDescription:
    "Win local customers and run everything behind the work: scheduling, quotes, invoicing, and your whole client list.",
  url: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  supportEmail: "support@roost.local",
} as const;

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  /** Matched against the first path segment to mark the active item. */
  segment: string;
};

/**
 * Provider-side navigation. Ordered by how a service business actually moves
 * through a day: what's happening now, then the work, then the money.
 */
export const businessNav: NavItem[] = [
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    segment: "dashboard",
  },
  {
    title: "Schedule",
    href: "/schedule",
    icon: CalendarDays,
    segment: "schedule",
  },
  {
    title: "Availability",
    href: "/availability",
    icon: CalendarRange,
    segment: "availability",
  },
  { title: "Services", href: "/services", icon: Wrench, segment: "services" },
  { title: "Clients", href: "/clients", icon: Users, segment: "clients" },
  { title: "Quotes", href: "/quotes", icon: FileText, segment: "quotes" },
  { title: "Invoices", href: "/invoices", icon: Receipt, segment: "invoices" },
  {
    title: "Storefront",
    href: "/storefront",
    icon: Store,
    segment: "storefront",
  },
];

export const settingsNav: NavItem[] = [
  { title: "Settings", href: "/settings", icon: Settings, segment: "settings" },
];

/** Sub-pages of Settings, listed on the settings index. */
export const settingsSections = [
  {
    title: "Team",
    href: "/settings/team",
    description: "Invite teammates and set what each person can do.",
  },
  {
    title: "Payments",
    href: "/settings/payments",
    description: "Connect Stripe and see where booking money goes.",
  },
] as const;
