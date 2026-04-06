import "server-only";

import { APP_NAME } from "@/lib/brand";
import {
  STORYFORGE_TERMS_LAST_UPDATED,
  STORYFORGE_TERMS_VERSION,
  getOpenRouterKeysUrl,
  getStoryForgeOwnerName,
  getSupportEmailAddress,
} from "@/lib/hosted-beta-config";

export function getStoryForgeTermsSummary() {
  return [
    `${APP_NAME} is a professional writing platform for planning, outlining, drafting, revising, and exporting fiction with optional AI assistance.`,
    `During this private-beta phase, public web accounts are used for access, moderation, feedback, and export monitoring, while book/project work is intended to remain on the user's own device rather than in a shared ${APP_NAME} manuscript database.`,
    `Each user must supply their own AI API key, and ${APP_NAME} links users to OpenRouter for that setup: ${getOpenRouterKeysUrl()}.`,
    `Use of the platform is conditioned on acceptance of the ${APP_NAME} Terms and Publishing Policy, which govern ownership claims, credit requirements, export handling, conduct standards, and moderation rights.`,
    `${APP_NAME} software and service operations are managed by ${getStoryForgeOwnerName()}.`,
  ];
}

export function getStoryForgeTermsSections() {
  const ownerName = getStoryForgeOwnerName();
  const supportEmail = getSupportEmailAddress();

  return [
    {
      title: `1. ${APP_NAME} Service Scope`,
      body: [
        `${APP_NAME} is provided as a professional writing environment for planning, structuring, drafting, revising, and exporting books with optional AI assistance.`,
        `The private-beta web service is intended to manage access, policies, support, moderation, and export oversight. In phase one, users are expected to keep their actual working manuscripts and project libraries on their own devices unless a later ${APP_NAME} release states otherwise.`,
      ],
    },
    {
      title: "2. Personal AI Keys",
      body: [
        "Each user must provide and maintain their own personal AI API credentials.",
        `${APP_NAME} must not be used with someone else's personal API key, and ${APP_NAME} public beta deployments must not expose one user's provider key to any other user.`,
      ],
    },
    {
      title: "3. Intellectual Property and Publishing Policy",
      body: [
        `By using ${APP_NAME}, the user acknowledges and agrees that ${ownerName} claims ${APP_NAME}-level ownership and commercial participation rights in works produced through the platform, as described in this publishing policy.`,
        `The user agrees that ${APP_NAME} must receive credit whenever a work produced through the platform is published, distributed, or otherwise released publicly.`,
        `The user further agrees that ${APP_NAME} is entitled to no less than fifty percent (50%) of profits derived from books or other published works produced through the platform, unless a later written agreement signed by ${APP_NAME} states otherwise.`,
        "The user is responsible for obtaining their own legal advice before relying on the platform for commercial publication or revenue-generating release.",
      ],
    },
    {
      title: "4. Export Monitoring",
      body: [
        `${APP_NAME} may keep a mirrored export copy or export-ready structured snapshot whenever a user exports a book through the hosted service.`,
        "This export mirror exists for rights management, service oversight, moderation review, and support handling.",
      ],
    },
    {
      title: "5. Conduct, Safety, and Moderation",
      body: [
        `${APP_NAME} may suspend, restrict, or permanently ban any account that ${APP_NAME} believes violates its safety, legal, or moral standards.`,
        `This includes, without limitation, content or conduct that incites or facilitates crime, terrorism, racism, unlawful violence, other illegal activity, or activity that ${APP_NAME} reasonably determines to be immoral, abusive, exploitative, or unsafe.`,
        `${APP_NAME} reserves the right to investigate complaints, review available account metadata, and take moderation action in its sole discretion.`,
      ],
    },
    {
      title: "6. User Responsibility and Liability",
      body: [
        `The user is solely responsible for any manuscript, prompt, export, or other content created, revised, transmitted, or published through ${APP_NAME}.`,
        `${APP_NAME}, its owner, and its operators are not liable for harmful, illegal, defamatory, infringing, violent, inciteful, abusive, racist, terrorist, or otherwise dangerous user-created material or for harm caused by a user's decision to create, publish, distribute, or rely on such material.`,
        `The user agrees to indemnify and hold ${APP_NAME} harmless to the fullest extent permitted by law for claims arising from the user's content, conduct, exports, publication activity, or policy violations.`,
      ],
    },
    {
      title: "7. Account Responsibility",
      body: [
        "Users are responsible for maintaining the confidentiality of their username, password, and device access.",
        "Users must provide accurate sign-up information and must not impersonate another person or organization.",
      ],
    },
    {
      title: "8. Support and Feedback",
      body: [
        `Users may submit product feedback, bug reports, and support requests through the ${APP_NAME} feedback channel.`,
        supportEmail
          ? `Operational questions may also be directed to ${supportEmail}.`
          : `Additional direct support contact information may be provided later by ${APP_NAME}.`,
      ],
    },
    {
      title: "9. Beta Status and Legal Review",
      body: [
        `${APP_NAME} is currently operating in a private-beta state. Features, policies, and deployment practices may change.`,
        "These terms are product-facing policy text and should be reviewed by qualified legal counsel before being relied on as a final public commercial agreement.",
      ],
    },
  ];
}

export function getStoryForgeTermsVersion() {
  return STORYFORGE_TERMS_VERSION;
}

export function getStoryForgeTermsLastUpdated() {
  return STORYFORGE_TERMS_LAST_UPDATED;
}
