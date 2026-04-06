"use client";

import { useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { APP_NAME } from "@/lib/brand";

export function FeedbackForm() {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    setError("");

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ subject, message }),
      });
      const json = await response.json();

      if (!response.ok || !json.ok) {
        throw new Error(json.error || "Could not send feedback.");
      }

      setSubject("");
      setMessage("");
      setNotice(`Thanks. Your feedback was sent to the ${APP_NAME} beta inbox.`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not send feedback.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="grid gap-4">
      <div className="grid gap-2">
          <h2 className="text-2xl font-semibold">Send feedback</h2>
          <p className="text-sm text-[var(--muted)]">
            Use this for bug reports, confusing UI, deployment problems, broken exports, feature ideas, or anything that
            blocks you from using {APP_NAME} comfortably.
          </p>
      </div>

      <form className="grid gap-4" onSubmit={handleSubmit}>
        <Field label="Subject">
          <input
            className="rounded-xl border border-[color:var(--line)] bg-white px-4 py-3 text-sm outline-none transition focus:border-[rgba(var(--accent-rgb),0.35)] focus:ring-2 focus:ring-[rgba(var(--accent-rgb),0.12)]"
            onChange={(event) => setSubject(event.target.value)}
            placeholder="Android install prompt is confusing"
            value={subject}
          />
        </Field>

        <Field label="Message" hint="Include steps to reproduce the problem when you can.">
          <textarea
            className="min-h-44 rounded-xl border border-[color:var(--line)] bg-white px-4 py-3 text-sm outline-none transition focus:border-[rgba(var(--accent-rgb),0.35)] focus:ring-2 focus:ring-[rgba(var(--accent-rgb),0.12)]"
            onChange={(event) => setMessage(event.target.value)}
            placeholder={`Tell ${APP_NAME} what happened, what you expected, and what device you were using.`}
            value={message}
          />
        </Field>

        {notice ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>
        ) : null}
        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <Button disabled={busy} type="submit">
            {busy ? "Sending..." : "Send feedback"}
          </Button>
          <Link
            className="inline-flex items-center justify-center rounded-md border border-[color:var(--line)] bg-white px-4 py-2 text-sm font-semibold text-[var(--text)] transition hover:border-[color:rgba(var(--accent-rgb),0.35)] hover:bg-[color:var(--panel-soft)]"
            href="/account"
          >
            Back to account
          </Link>
        </div>
      </form>
    </Card>
  );
}
