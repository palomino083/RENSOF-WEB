/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: "/alven/app",
  assetPrefix: "/alven/app",
  reactStrictMode: true,
  swcMinify: true,
  async redirects() {
    return [
      {
        source: "/",
        destination: "/alven/app/login",
        basePath: false,
        permanent: false
      }
    ];
  }
};

module.exports = nextConfig;