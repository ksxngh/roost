import { redirect } from "next/navigation";

/** The admin home is the verification queue — the one thing that needs doing. */
export default function AdminHomePage() {
  redirect("/admin/verification");
}
