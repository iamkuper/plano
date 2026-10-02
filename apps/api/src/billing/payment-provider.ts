export interface InitParams {
  orderId: string;
  // Kopecks.
  amount: number;
  description: string;
  // Id of the customer at the bank; ties saved cards to a workspace.
  customerKey: string;
  // Save the card for recurring charges (first payment only).
  recurrent: boolean;
  email?: string;
}

export interface InitResult {
  providerPaymentId: string;
  paymentUrl: string;
}

export interface ChargeResult {
  confirmed: boolean;
  reason?: string;
}

// Result of a bank notification, normalised.
export interface PaymentNotification {
  orderId: string;
  providerPaymentId: string;
  status: "CONFIRMED" | "FAILED" | "IGNORE";
  amount: number;
  rebillId?: string;
  cardMask?: string;
  reason?: string;
}

export interface PaymentProvider {
  readonly test: boolean;
  init(params: InitParams): Promise<InitResult>;
  // Charge the saved card for a payment created with init().
  charge(providerPaymentId: string, rebillId: string): Promise<ChargeResult>;
  // Throws if the notification isn't authentic.
  parseNotification(body: Record<string, unknown>): PaymentNotification;
}

export const PAYMENT_PROVIDER = Symbol("PAYMENT_PROVIDER");
