import Link from "next/link";
import { ArrowRight, FileUp, MessageSquare, SquareStack } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { siteConfig } from "@/lib/site-config";

const features = [
  {
    icon: FileUp,
    title: "Upload anything",
    description:
      "PDFs, slides, lecture notes, screenshots, even handwriting — StudyForge reads it all.",
  },
  {
    icon: SquareStack,
    title: "Instant study material",
    description:
      "Flashcards, quizzes, summaries, and study guides generated from your own material.",
  },
  {
    icon: MessageSquare,
    title: "A tutor that cites its sources",
    description:
      "Ask questions and get answers grounded only in your documents, with page references.",
  },
];

export default function LandingPage() {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4">
        <BrandMark />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button asChild variant="ghost">
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild>
            <Link href="/signup">
              Get started
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto flex w-full max-w-4xl flex-col items-center px-4 pt-24 pb-16 text-center">
          <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
            Learn twice as fast from the material you already have
          </h1>
          <p className="text-muted-foreground mt-6 max-w-xl text-lg text-balance">
            {siteConfig.description}
          </p>
          <div className="mt-10 flex gap-3">
            <Button asChild size="lg">
              <Link href="/signup">
                Start studying free
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </section>

        <section
          aria-label="Features"
          className="mx-auto grid w-full max-w-5xl gap-4 px-4 pb-24 sm:grid-cols-3"
        >
          {features.map((feature) => (
            <Card key={feature.title}>
              <CardHeader>
                <div className="bg-primary/10 text-primary mb-2 flex size-10 items-center justify-center rounded-lg">
                  <feature.icon className="size-5" aria-hidden="true" />
                </div>
                <CardTitle>{feature.title}</CardTitle>
                <CardDescription>{feature.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </section>
      </main>

      <footer className="text-muted-foreground mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 text-sm">
        <span>
          © {new Date().getFullYear()} {siteConfig.name}
        </span>
        <span>Built for students, by students.</span>
      </footer>
    </div>
  );
}
