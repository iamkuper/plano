import { PricingPage, pricingMetadata } from "@/components/marketing/pricing-page";

export const metadata = pricingMetadata("ru");

export default function RuPricing() {
  return <PricingPage locale="ru" />;
}
