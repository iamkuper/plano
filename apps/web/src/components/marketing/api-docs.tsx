import type { Metadata } from "next";
import { WEBHOOK_EVENTS, type Locale } from "@plano/shared";
import { makeTr, sitePath, type Tr } from "@/lib/marketing";
import { SITE_NAME, SITE_URL } from "@/lib/seo";
import { SiteFooter, SiteHeader } from "@/components/marketing/site";

const API = process.env.NEXT_PUBLIC_API_URL ?? "https://api.plano.team";

export function apiDocsMetadata(locale: Locale): Metadata {
  const tr = makeTr(locale);
  const title = tr("mk.apiDocs.title");
  const description = tr("mk.apiDocs.lead");
  return {
    title,
    description,
    alternates: { canonical: sitePath(locale, "/docs/api"), languages: { ru: "/docs/api", en: "/en/docs/api", "x-default": "/docs/api" } },
    openGraph: { type: "website", locale: locale === "en" ? "en_US" : "ru_RU", url: `${SITE_URL}${sitePath(locale, "/docs/api")}`, siteName: SITE_NAME, title, description },
  };
}

const ENDPOINTS: [method: string, path: string, key: string][] = [
  ["GET", "/users/me", "me"],
  ["GET", "/users", "users"],
  ["GET", "/projects", "projects"],
  ["POST", "/projects", "createProject"],
  ["GET", "/projects/{id}/board", "board"],
  ["GET", "/cards/search?q=", "search"],
  ["GET", "/cards/{id}", "card"],
  ["POST", "/cards", "createCard"],
  ["PATCH", "/cards/{id}", "updateCard"],
  ["POST", "/cards/{id}/move", "moveCard"],
  ["DELETE", "/cards/{id}", "deleteCard"],
  ["POST", "/cards/{id}/comments", "comment"],
  ["POST", "/cards/{id}/checklist", "checklist"],
  ["GET", "/labels", "labels"],
  ["POST", "/labels", "createLabel"],
];

const PAYLOAD = `{
  "event": "card.moved",
  "createdAt": "2026-11-03T09:15:00.000Z",
  "actor": { "id": "clx1…", "name": "Anna" },
  "card": {
    "id": "clx2…",
    "key": "TSK-12",
    "title": "Prepare the brief",
    "priority": "HIGH",
    "dueDate": "2026-11-10T00:00:00.000Z",
    "project": { "id": "clx3…", "title": "Website" },
    "column": { "id": "clx4…", "title": "In progress" },
    "assignees": [{ "id": "clx1…", "name": "Anna" }],
    "labels": [{ "id": "clx5…", "name": "Feature", "color": "blue" }],
    "url": "https://app.example.com/projects/clx3…?card=clx2…"
  },
  "from": "Backlog",
  "to": "In progress"
}`;

const VERIFY_NODE = `import { createHmac, timingSafeEqual } from "crypto";

function isValid(rawBody, headers, secret) {
  const expected = createHmac("sha256", secret)
    .update(headers["x-plano-timestamp"] + "." + rawBody)
    .digest("hex");
  const got = headers["x-plano-signature"].replace("sha256=", "");
  return got.length === expected.length && timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}`;

function Code({ children, label }: { children: string; label?: string }) {
  return (
    <pre aria-label={label} className="mt-3 overflow-x-auto rounded-lg border border-border bg-surface-soft p-4 text-xs leading-relaxed">
      <code>{children}</code>
    </pre>
  );
}

const H2 = ({ id, children }: { id: string; children: React.ReactNode }) => (
  <h2 id={id} className="mt-14 scroll-mt-20 text-2xl font-semibold tracking-tight">
    {children}
  </h2>
);

function Reference({ tr }: { tr: Tr }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-left text-sm">
        <tbody className="divide-y divide-border">
          {ENDPOINTS.map(([method, path, key]) => (
            <tr key={`${method} ${path}`} className="align-top">
              <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs font-semibold">{method}</td>
              <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs">{path}</td>
              <td className="px-4 py-2.5 text-ink-faint">{tr(`mk.apiDocs.ep.${key}`)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ApiDocsPage({ locale }: { locale: Locale }) {
  const tr = makeTr(locale);
  return (
    <div lang={locale} className="min-h-screen bg-bg">
      <SiteHeader locale={locale} path="/docs/api" />
      <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <h1 className="text-4xl font-semibold tracking-tight">{tr("mk.apiDocs.title")}</h1>
        <p className="mt-3 text-ink-faint">{tr("mk.apiDocs.lead")}</p>

        <H2 id="auth">{tr("mk.apiDocs.authTitle")}</H2>
        <p className="mt-3 text-ink-soft">{tr("mk.apiDocs.authBody")}</p>
        <Code label="curl">{`curl ${API}/users/me \\\n  -H "Authorization: Bearer <token>"`}</Code>
        <ul className="mt-4 list-disc space-y-1.5 pl-5 text-sm text-ink-soft">
          <li>{tr("mk.apiDocs.authRights")}</li>
          <li>{tr("mk.apiDocs.authLocked")}</li>
          <li>{tr("mk.apiDocs.authErrors")}</li>
        </ul>

        <H2 id="quickstart">{tr("mk.apiDocs.quickTitle")}</H2>
        <p className="mt-3 text-ink-soft">{tr("mk.apiDocs.quickBody")}</p>
        <Code label="curl">{`# 1. ${tr("mk.apiDocs.quickStep1")}
curl ${API}/projects -H "Authorization: Bearer <token>"

# 2. ${tr("mk.apiDocs.quickStep2")}
curl ${API}/projects/<projectId>/board -H "Authorization: Bearer <token>"

# 3. ${tr("mk.apiDocs.quickStep3")}
curl -X POST ${API}/cards \\
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \\
  -d '{"columnId": "<columnId>", "title": "Hello from the API", "priority": "HIGH", "dueDate": "2026-11-10"}'`}</Code>

        <H2 id="reference">{tr("mk.apiDocs.refTitle")}</H2>
        <p className="mt-3 text-ink-soft">{tr("mk.apiDocs.refBody", { api: API })}</p>
        <Reference tr={tr} />
        <p className="mt-3 text-sm text-ink-faint">{tr("mk.apiDocs.refNote")}</p>

        <H2 id="webhooks">{tr("mk.apiDocs.hooksTitle")}</H2>
        <p className="mt-3 text-ink-soft">{tr("mk.apiDocs.hooksBody")}</p>
        <ul className="mt-4 space-y-1.5 text-sm">
          {WEBHOOK_EVENTS.map((ev) => (
            <li key={ev} className="flex gap-3">
              <code className="w-36 shrink-0 text-xs">{ev}</code>
              <span className="text-ink-faint">{tr(`mk.apiDocs.event.${ev}`)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-ink-soft">{tr("mk.apiDocs.hooksPayload")}</p>
        <Code label="JSON">{PAYLOAD}</Code>
        <p className="mt-4 text-ink-soft">{tr("mk.apiDocs.hooksHeaders")}</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-soft">
          <li>
            <code className="text-xs">X-Plano-Event</code>: {tr("mk.apiDocs.headerEvent")}
          </li>
          <li>
            <code className="text-xs">X-Plano-Timestamp</code>: {tr("mk.apiDocs.headerTimestamp")}
          </li>
          <li>
            <code className="text-xs">X-Plano-Signature</code>: <code className="text-xs">sha256=&lt;hex&gt;</code>, {tr("mk.apiDocs.headerSignature")}
          </li>
        </ul>
        <Code label="Node.js">{VERIFY_NODE}</Code>
        <p className="mt-4 text-sm text-ink-faint">{tr("mk.apiDocs.hooksDelivery")}</p>

        <H2 id="calendar">{tr("mk.apiDocs.calTitle")}</H2>
        <p className="mt-3 text-ink-soft">{tr("mk.apiDocs.calBody")}</p>
      </main>
      <SiteFooter locale={locale} />
    </div>
  );
}
