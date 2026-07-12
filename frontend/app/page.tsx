import { redirect } from "next/navigation";

// The landing page lives at /home. Send the root there until a dedicated
// root experience exists (see context/frontend/06-frontend-roadmap.md).
export default function RootPage() {
  redirect("/home");
}
