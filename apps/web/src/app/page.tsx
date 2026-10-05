import { Landing, landingMetadata } from "@/components/marketing/landing";

export const metadata = landingMetadata("ru");

export default function RootLanding() {
  return <Landing locale="ru" />;
}
