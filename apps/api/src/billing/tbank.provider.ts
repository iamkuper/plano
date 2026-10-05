import { createHash } from "crypto";
import { BadGatewayException, Logger, UnauthorizedException } from "@nestjs/common";
import type { ChargeResult, InitParams, InitResult, PaymentNotification, PaymentProvider } from "./payment-provider";
import { t } from "@plano/shared";
// T-Bank acquiring (T-Kassa) API v2: https://www.tbank.ru/kassa/dev/payments/
// Every request and notification carries Token = SHA-256 of the root-level
// scalar parameters plus Password, sorted by key and concatenated by value.
export function tbankToken(params: Record<string, unknown>, password: string) {
  const all: Record<string, unknown> = { ...params, Password: password };
  delete all.Token;
  const concat = Object.keys(all)
    .filter((k) => all[k] !== null && all[k] !== undefined && typeof all[k] !== "object")
    .sort()
    .map((k) => String(all[k]))
    .join("");
  return createHash("sha256").update(concat).digest("hex");
}

export interface TbankConfig {
  terminalKey: string;
  password: string;
  apiUrl: string;
  // Where the bank redirects the customer, and where it posts notifications.
  successUrl: string;
  failUrl: string;
  notificationUrl: string;
  // Fiscal receipt (54-FZ). Sent only when a taxation system is configured.
  taxation?: string;
  tax: string;
}

export class TbankProvider implements PaymentProvider {
  readonly test = false;
  private readonly log = new Logger(TbankProvider.name);

  constructor(private readonly cfg: TbankConfig) {}

  private async call<T extends Record<string, any>>(method: string, body: Record<string, unknown>): Promise<T> {
    const payload = { TerminalKey: this.cfg.terminalKey, ...body };
    const res = await fetch(`${this.cfg.apiUrl}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...payload, Token: tbankToken(payload, this.cfg.password) }),
      // A hung connection must not hang the payment button.
      signal: AbortSignal.timeout(20_000),
    }).catch((e) => {
      // "fetch failed" alone says nothing: the reason (DNS, refused, certificate,
      // timeout) is in `cause`.
      const cause = (e as { cause?: { code?: string; message?: string } }).cause;
      this.log.error(`${method} ${this.cfg.apiUrl}: ${(e as Error).message}${cause ? ` (${cause.code ?? ""} ${cause.message ?? ""})` : ""}`.trim());
      throw new BadGatewayException(t("api.billing.thePaymentServiceIsUnavailable"));
    });
    const data = (await res.json().catch(() => ({}))) as T;
    return data;
  }

  async init(p: InitParams): Promise<InitResult> {
    const receipt = this.cfg.taxation && p.email
      ? {
          Email: p.email,
          Taxation: this.cfg.taxation,
          // Access to the service, paid in full: "услуга", "полный расчёт".
          Items: [{ Name: p.description.slice(0, 128), Price: p.amount, Quantity: 1, Amount: p.amount, Tax: this.cfg.tax, PaymentMethod: "full_payment", PaymentObject: "service" }],
        }
      : undefined;
    const data = await this.call<{ Success: boolean; PaymentId?: string; PaymentURL?: string; Message?: string; Details?: string }>("Init", {
      Amount: p.amount,
      OrderId: p.orderId,
      Description: p.description,
      CustomerKey: p.customerKey,
      ...(p.recurrent ? { Recurrent: "Y" } : {}),
      SuccessURL: this.cfg.successUrl,
      FailURL: this.cfg.failUrl,
      NotificationURL: this.cfg.notificationUrl,
      ...(receipt ? { Receipt: receipt } : {}),
    });
    if (!data.Success || !data.PaymentId) {
      this.log.error(`Init failed: ${data.Message} ${data.Details}`);
      throw new BadGatewayException(t("api.billing.couldNotCreateThePayment2"));
    }
    return { providerPaymentId: String(data.PaymentId), paymentUrl: data.PaymentURL ?? "" };
  }

  async charge(providerPaymentId: string, rebillId: string): Promise<ChargeResult> {
    const data = await this.call<{ Success: boolean; Status?: string; Message?: string; Details?: string }>("Charge", {
      PaymentId: providerPaymentId,
      RebillId: rebillId,
    });
    if (data.Success && data.Status === "CONFIRMED") return { confirmed: true };
    return { confirmed: false, reason: data.Details || data.Message || data.Status || t("api.billing.paymentDeclined") };
  }

  parseNotification(body: Record<string, unknown>): PaymentNotification {
    if (typeof body.Token !== "string" || body.Token !== tbankToken(body, this.cfg.password)) {
      throw new UnauthorizedException("Bad token");
    }
    const status = String(body.Status ?? "");
    return {
      orderId: String(body.OrderId ?? ""),
      providerPaymentId: String(body.PaymentId ?? ""),
      status: status === "CONFIRMED" ? "CONFIRMED" : ["REJECTED", "CANCELED", "DEADLINE_EXPIRED", "AUTH_FAIL", "REVERSED"].includes(status) ? "FAILED" : "IGNORE",
      amount: Number(body.Amount ?? 0),
      rebillId: body.RebillId ? String(body.RebillId) : undefined,
      cardMask: body.Pan ? String(body.Pan) : undefined,
      reason: body.Message ? String(body.Message) : status || undefined,
    };
  }
}
