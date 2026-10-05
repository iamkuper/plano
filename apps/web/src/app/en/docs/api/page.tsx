import { ApiDocsPage, apiDocsMetadata } from "@/components/marketing/api-docs";

export const metadata = apiDocsMetadata("en");

export default function EnApiDocs() {
  return <ApiDocsPage locale="en" />;
}
