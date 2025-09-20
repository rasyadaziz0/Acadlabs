import type { MetadataRoute } from "next";

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://acadlabs.fun";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${baseUrl}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${baseUrl}/login`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${baseUrl}/register`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${baseUrl}/upload`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${baseUrl}/dashboard`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
  ];
}
