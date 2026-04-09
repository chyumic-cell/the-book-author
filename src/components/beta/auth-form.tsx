"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { APP_NAME } from "@/lib/brand";

export function AuthForm({
  mode,
}: {
  mode: "sign-in" | "sign-up";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const response = await fetch(mode === "sign-in" ? "/api/auth/sign-in" : "/api/auth/sign-up", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username,
          password,
          displayName,
          agreedToTerms,
        }),
      });
      const json = await response.json();

      if (!response.ok || !json.ok) {
        throw new Error(json.error || "Could not sign in.");
      }

      router.push("/");
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mx-auto grid w-full max-w-xl gap-5">
      <div className="grid gap-2">
        <h1 className="text-4xl font-semibold">{mode === "sign-in" ? `Sign in to ${APP_NAME}` : `Create your ${APP_NAME} account`}</h1>
        <p className="text-sm text-[var(--muted)]">
          {mode === "sign-in"
            ? `Use your ${APP_NAME} username and password to access your account.`
            : `Create a username and password for ${APP_NAME}. You will be asked to accept the ${APP_NAME} Terms and Publishing Policy before the account is created.`}
        </p>
      </div>

      <form className="grid gap-4" onSubmit={handleSubmit}>
        {mode === "sign-up" ? (
          <Field label="Display name" hint={`This is how ${APP_NAME} will show your account in support, feedback, and admin moderation screens.`}>
            <input
              className="rounded-xl border border-[color:var(--line)] bg-white px-4 py-3 text-sm outline-none transition focus:border-[rgba(var(--accent-rgb),0.35)] focus:ring-2 focus:ring-[rgba(var(--accent-rgb),0.12)]"
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Michael Polevoy"
              value={displayName}
            />
          </Field>
        ) : null}

        <Field label="Username" hint="Use 3 to 32 characters: letters, numbers, dots, dashes, or underscores.">
          <input
            autoCapitalize="none"
            autoCorrect="off"
            className="rounded-xl border border-[color:var(--line)] bg-white px-4 py-3 text-sm outline-none transition focus:border-[rgba(var(--accent-rgb),0.35)] focus:ring-2 focus:ring-[rgba(var(--accent-rgb),0.12)]"
            onChange={(event) => setUsername(event.target.value)}
            placeholder="mwpolevoy"
            value={username}
          />
        </Field>

        <Field label="Password" hint="Passwords must be at least 8 characters long.">
          <input
            className="rounded-xl border border-[color:var(--line)] bg-white px-4 py-3 text-sm outline-none transition focus:border-[rgba(var(--accent-rgb),0.35)] focus:ring-2 focus:ring-[rgba(var(--accent-rgb),0.12)]"
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            value={password}
          />
        </Field>

        {mode === "sign-up" ? (
          <label className="flex items-start gap-3 rounded-2xl border border-[color:var(--line)] bg-[color:var(--panel-soft)] px-4 py-3 text-sm text-[var(--muted)]">
            <input
              checked={agreedToTerms}
              className="mt-1"
              onChange={(event) => setAgreedToTerms(event.target.checked)}
              type="checkbox"
            />
            <span>
              I have read and agree to the {APP_NAME} Terms and Publishing Policy, including the {APP_NAME} ownership,
              credit, moderation, export-monitoring, and revenue-sharing clauses.{" "}
              <a className="font-medium text-[var(--accent)] underline" href="/terms">
                Read the terms
              </a>
              .
            </span>
          </label>
        ) : null}

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <Button disabled={busy} type="submit">
            {busy ? "Working..." : mode === "sign-in" ? "Sign in" : "Create account"}
          </Button>
          <Link
            className="inline-flex items-center justify-center rounded-md border border-[color:var(--line)] bg-white px-4 py-2 text-sm font-semibold text-[var(--text)] transition hover:border-[color:rgba(var(--accent-rgb),0.35)] hover:bg-[color:var(--panel-soft)]"
            href={mode === "sign-in" ? "/sign-up" : "/sign-in"}
          >
            {mode === "sign-in" ? "Need an account?" : "Already have an account?"}
          </Link>
        </div>
      </form>
    </Card>
  );
}
