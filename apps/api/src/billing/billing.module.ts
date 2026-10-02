import { Global, Module, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { BillingController } from "./billing.controller";
import { BillingService } from "./billing.service";
import { MockProvider } from "./mock.provider";
import { PAYMENT_PROVIDER, type PaymentProvider } from "./payment-provider";
import { TbankProvider } from "./tbank.provider";

// TBANK_TERMINAL_KEY + TBANK_PASSWORD select the real T-Bank terminal (use the
// test terminal's keys while testing); without them the built-in test
// provider is used, so the app works locally with no bank account.
export function createProvider(env = process.env): PaymentProvider {
  const appUrl = (env.APP_URL ?? "http://localhost:3100").replace(/\/$/, "");
  if (env.TBANK_TERMINAL_KEY && env.TBANK_PASSWORD) {
    const apiPublic = (env.API_PUBLIC_URL ?? `http://localhost:${env.PORT ?? 3101}`).replace(/\/$/, "");
    return new TbankProvider({
      terminalKey: env.TBANK_TERMINAL_KEY,
      password: env.TBANK_PASSWORD,
      apiUrl: (env.TBANK_API_URL ?? "https://securepay.tinkoff.ru/v2").replace(/\/$/, ""),
      successUrl: `${appUrl}/settings/billing?paid=1`,
      failUrl: `${appUrl}/settings/billing?paid=0`,
      notificationUrl: `${apiPublic}/billing/webhooks/tbank`,
      taxation: env.TBANK_TAXATION,
      tax: env.TBANK_TAX ?? "none",
    });
  }
  return new MockProvider(appUrl, env.MOCK_CHARGE_FAIL === "1");
}

@Global()
@Module({
  controllers: [BillingController],
  providers: [BillingService, { provide: PAYMENT_PROVIDER, useFactory: () => createProvider() }],
  exports: [BillingService],
})
export class BillingModule implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;

  constructor(private readonly billing: BillingService) {}

  // Renewals and trial expiry: check every 10 minutes, and once after start.
  onModuleInit() {
    // Tests drive the scheduler by hand (DISABLE_SCHEDULERS=1).
    if (process.env.DISABLE_SCHEDULERS === "1") return;
    const run = () => this.billing.runDue().catch(() => {});
    this.timer = setInterval(run, 10 * 60_000);
    setTimeout(run, 10_000);
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }
}
