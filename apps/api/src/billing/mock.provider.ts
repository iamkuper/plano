import { randomBytes } from "crypto";
import { ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import type { ChargeResult, InitParams, InitResult, PaymentNotification, PaymentProvider } from "./payment-provider";
import { tbankToken } from "./tbank.provider";
import { t } from "@plano/shared";
// Stand-in for T-Bank when no terminal is configured (local development):
// the "bank page" is /billing/mock-pay in the web app, and notifications use
// the same signed format as the real ones, so they take the same code path.
export const MOCK_PASSWORD = "mock-terminal-password";

export function mockNotification(fields: Record<string, unknown>) {
  const body = { TerminalKey: "mock", ...fields };
  return { ...body, Token: tbankToken(body, MOCK_PASSWORD) };
}

export class MockProvider implements PaymentProvider {
  readonly test = true;

  constructor(
    private readonly appUrl: string,
    // Set MOCK_CHARGE_FAIL=1 to see how failed renewals behave.
    private readonly chargeFails = false,
  ) {}

  async init(p: InitParams): Promise<InitResult> {
    return {
      providerPaymentId: `mock_${randomBytes(6).toString("hex")}`,
      paymentUrl: `${this.appUrl}/billing/mock-pay?order=${encodeURIComponent(p.orderId)}`,
    };
  }

  async charge(): Promise<ChargeResult> {
    return this.chargeFails ? { confirmed: false, reason: t("api.billing.insufficientFundsTest") } : { confirmed: true };
  }

  parseNotification(body: Record<string, unknown>): PaymentNotification {
    if (typeof body.Token !== "string" || body.Token !== tbankToken(body, MOCK_PASSWORD)) throw new UnauthorizedException("Bad token");
    const ok = body.Status === "CONFIRMED";
    return {
      orderId: String(body.OrderId),
      providerPaymentId: String(body.PaymentId),
      status: ok ? "CONFIRMED" : "FAILED",
      amount: Number(body.Amount),
      rebillId: ok ? `mock-rebill-${String(body.OrderId).slice(-8)}` : undefined,
      cardMask: ok ? "430000******0777" : undefined,
      reason: ok ? undefined : t("api.billing.paymentDeclinedTest"),
    };
  }
}

// Production without a T-Bank terminal: card payments are refused (the test
// provider would let anyone "pay" for free). Paying by invoice still works.
export class DisabledProvider implements PaymentProvider {
  readonly test = false;

  async init(): Promise<InitResult> {
    throw new ServiceUnavailableException(t("api.billing.cardPaymentsAreStillBeing"));
  }

  async charge(): Promise<ChargeResult> {
    return { confirmed: false, reason: t("api.billing.cardPaymentsAreNotConnected") };
  }

  parseNotification(): PaymentNotification {
    throw new UnauthorizedException();
  }
}
