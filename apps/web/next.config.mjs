/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Old addresses after staff and templates moved into settings.
  // The app behind sign-in is never indexed (robots.txt also disallows it).
  async headers() {
    const app = ["dashboard", "projects", "team", "reports", "settings", "profile", "platform", "billing", "invite", "reset", "forgot"];
    return app.map((p) => ({ source: `/${p}/:path*`, headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }));
  },
  async redirects() {
    return [
      { source: "/users", destination: "/settings/users", permanent: false },
      { source: "/templates/:path*", destination: "/settings/templates/:path*", permanent: false },
      { source: "/settings/roles", destination: "/settings/users", permanent: true },
      { source: "/clients", destination: "/projects", permanent: false },
    ];
  },
};

export default nextConfig;
