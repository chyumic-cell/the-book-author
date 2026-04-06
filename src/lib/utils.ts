import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function toSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function wordCount(value: string | null | undefined) {
  if (!value) {
    return 0;
  }

  return value.trim().split(/\s+/).filter(Boolean).length;
}

export function safeArray<T>(value: T[] | null | undefined) {
  return Array.isArray(value) ? value : [];
}

export function compactText(value: string, maxLength = 280) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3).trimEnd()}...`;
}
