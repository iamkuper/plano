// Where people reach support. Set in apps/web/.env.local:
// NEXT_PUBLIC_SUPPORT_TELEGRAM=plano_support (username, no @), NEXT_PUBLIC_SUPPORT_EMAIL=support@...
const telegram = process.env.NEXT_PUBLIC_SUPPORT_TELEGRAM?.replace(/^@/, "");
const email = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;

export const SUPPORT = {
  telegram: telegram ? `https://t.me/${telegram}` : null,
  email: email ? `mailto:${email}` : null,
  emailAddress: email ?? null,
  // The main contact: Telegram first, then mail.
  get url() {
    return this.telegram ?? this.email;
  },
};
