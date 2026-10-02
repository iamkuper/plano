// Where people reach support. Set in apps/web/.env.local:
// NEXT_PUBLIC_SUPPORT_TELEGRAM=plano_support (username, no @), NEXT_PUBLIC_SUPPORT_WHATSAPP=79991234567,
// NEXT_PUBLIC_SUPPORT_EMAIL=support@...
const telegram = process.env.NEXT_PUBLIC_SUPPORT_TELEGRAM?.replace(/^@/, "");
const email = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;
// WhatsApp number in international format, digits only: 79991234567.
const whatsapp = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP?.replace(/\D/g, "");

export const SUPPORT = {
  telegram: telegram ? `https://t.me/${telegram}` : null,
  whatsapp: whatsapp ? `https://wa.me/${whatsapp}` : null,
  email: email ? `mailto:${email}` : null,
  emailAddress: email ?? null,
  // The main contact: Telegram first, then mail.
  get url() {
    return this.telegram ?? this.email;
  },
};
