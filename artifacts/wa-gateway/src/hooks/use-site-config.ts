import { useState, useEffect } from "react";

export interface SiteConfig {
  siteName: string;
  siteLogo: string;
  siteTagline: string;
  favicon: string;
  siteDescription: string;
}

const defaultConfig: SiteConfig = {
  siteName: "WA Gateway",
  siteLogo: "⚡",
  siteTagline: "Platform WhatsApp #1 di Indonesia",
  favicon: "/favicon.svg",
  siteDescription: "Kelola semua pesan WhatsApp bisnis Anda dalam satu dashboard.",
};

export function useSiteConfig(): SiteConfig {
  const [config, setConfig] = useState<SiteConfig>(defaultConfig);

  useEffect(() => {
    fetch("/api/public/landing")
      .then((r) => r.json())
      .then((d) => {
        setConfig({
          siteName: d.siteName || defaultConfig.siteName,
          siteLogo: d.siteLogo || defaultConfig.siteLogo,
          siteTagline: d.siteTagline || defaultConfig.siteTagline,
          favicon: d.seo?.favicon || d.siteFavicon || defaultConfig.favicon,
          siteDescription: d.seo?.description || defaultConfig.siteDescription,
        });
      })
      .catch(() => {});
  }, []);

  return config;
}
