"use client";

import type { User } from "@/lib/types";
import { AvatarUpload } from "./AvatarUpload";
import { ContactForm } from "./ContactForm";
import { CredentialForms } from "./CredentialForms";

const card = "rounded-2xl border border-border bg-card p-6";

export function ProfileClient({ user }: { user: User }) {
  return (
    <div className="space-y-6">
      <section className={card}>
        <AvatarUpload user={user} />
      </section>
      <section className={card}>
        <ContactForm user={user} />
      </section>
      <section className={card}>
        <CredentialForms user={user} />
      </section>
    </div>
  );
}
