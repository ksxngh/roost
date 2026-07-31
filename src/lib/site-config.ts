/**
 * Central place for product identity and top-level navigation. Every surface
 * (metadata, shell, marketing) reads from here so a rename or nav change is a
 * one-file edit.
 */
import {
  BookOpen,
  GraduationCap,
  LayoutDashboard,
  Library,
  MessageSquare,
  Settings,
  SquareStack,
  type LucideIcon,
} from "lucide-react";

export const siteConfig = {
  name: "StudyForge",
  description:
    "Turn lecture notes, PDFs, and slides into flashcards, quizzes, and an AI tutor that only answers from your material.",
  url: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
} as const;

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  /** Matched against the pathname to mark the active item. */
  segment: string;
};

export const appNav: NavItem[] = [
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    segment: "dashboard",
  },
  { title: "Library", href: "/library", icon: Library, segment: "library" },
  {
    title: "Flashcards",
    href: "/flashcards",
    icon: SquareStack,
    segment: "flashcards",
  },
  {
    title: "Quizzes",
    href: "/quizzes",
    icon: GraduationCap,
    segment: "quizzes",
  },
  { title: "AI Chat", href: "/chat", icon: MessageSquare, segment: "chat" },
  { title: "Guides", href: "/guides", icon: BookOpen, segment: "guides" },
];

export const settingsNav: NavItem[] = [
  { title: "Settings", href: "/settings", icon: Settings, segment: "settings" },
];
