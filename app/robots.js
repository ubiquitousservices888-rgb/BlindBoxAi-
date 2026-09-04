export default function robots() {
  const privatePaths = ["/owner-dashboard", "/media-upload", "/api/owner"];
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: privatePaths },
      { userAgent: "OAI-SearchBot", allow: ["/", "/ai-family", "/ai-family/feed"], disallow: privatePaths },
      { userAgent: "GPTBot", allow: ["/", "/ai-family", "/ai-family/feed"], disallow: privatePaths },
      { userAgent: "ClaudeBot", allow: ["/", "/ai-family", "/ai-family/feed"], disallow: privatePaths },
      { userAgent: "Google-Extended", allow: ["/", "/ai-family", "/ai-family/feed"], disallow: privatePaths },
    ],
    sitemap: "https://www.blindboxai.com/sitemap.xml",
    host: "https://www.blindboxai.com",
  };
}
