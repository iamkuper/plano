/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Old addresses after staff and templates moved into settings.
  async redirects() {
    return [
      { source: "/users", destination: "/settings/users", permanent: false },
      { source: "/templates/:path*", destination: "/settings/templates/:path*", permanent: false },
      { source: "/clients", destination: "/projects", permanent: false },
    ];
  },
};

export default nextConfig;
