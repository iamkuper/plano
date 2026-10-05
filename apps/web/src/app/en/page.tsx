import { Landing, landingMetadata } from "@/components/marketing/landing";

export const metadata = landingMetadata("en");

export default function EnglishLanding() {
  return <Landing locale="en" />;
}
