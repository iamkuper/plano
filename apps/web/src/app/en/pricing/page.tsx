import { PricingPage, pricingMetadata } from "@/components/marketing/pricing-page";

export const metadata = pricingMetadata("en");

export default function EnPricing() {
  return <PricingPage locale="en" />;
}
