import { ApiDocsPage, apiDocsMetadata } from "@/components/marketing/api-docs";

export const metadata = apiDocsMetadata("ru");

export default function ApiDocs() {
  return <ApiDocsPage locale="ru" />;
}
