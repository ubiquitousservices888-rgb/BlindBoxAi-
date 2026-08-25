export default function robots() {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/owner-dashboard", "/media-upload"],
    },
    sitemap: "https://www.blindboxai.com/sitemap.xml",
    host: "https://www.blindboxai.com",
  };
}
