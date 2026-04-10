import { useEffect } from "react";

interface SEOOptions {
  title?: string;
  description?: string;
  keywords?: string;
  ogImage?: string;
  favicon?: string;
  author?: string;
  robots?: string;
  siteName?: string;
}

function setMeta(selector: string, attr: string, value: string) {
  if (!value) return;
  let el = document.querySelector(selector) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    const parts = selector.match(/\[([^=]+)="([^"]+)"\]/);
    if (parts) el.setAttribute(parts[1]!, parts[2]!);
    document.head.appendChild(el);
  }
  el.setAttribute(attr, value);
}

function setFavicon(href: string) {
  if (!href) return;
  // Remove all existing favicon links
  document.querySelectorAll("link[rel*='icon']").forEach((el) => el.remove());
  const link = document.createElement("link");
  link.rel = "icon";
  // Detect if base64 (data URI)
  if (href.startsWith("data:")) {
    const mime = href.match(/^data:([^;]+)/)?.[1] ?? "image/png";
    link.type = mime;
  } else if (href.endsWith(".svg")) {
    link.type = "image/svg+xml";
  } else if (href.endsWith(".ico")) {
    link.type = "image/x-icon";
  } else {
    link.type = "image/png";
  }
  link.href = href;
  document.head.appendChild(link);
}

export function useDynamicSEO(opts: SEOOptions) {
  useEffect(() => {
    if (!opts.title && !opts.description && !opts.favicon) return;

    // Title
    if (opts.title) {
      document.title = opts.title;
      setMeta('meta[property="og:title"]', "content", opts.title);
      setMeta('meta[name="twitter:title"]', "content", opts.title);
    }

    // Description
    if (opts.description) {
      setMeta('meta[name="description"]', "content", opts.description);
      setMeta('meta[property="og:description"]', "content", opts.description);
      setMeta('meta[name="twitter:description"]', "content", opts.description);
    }

    // Keywords
    if (opts.keywords) {
      setMeta('meta[name="keywords"]', "content", opts.keywords);
    }

    // Author
    if (opts.author) {
      setMeta('meta[name="author"]', "content", opts.author);
    }

    // Robots
    if (opts.robots) {
      setMeta('meta[name="robots"]', "content", opts.robots);
    }

    // OG Image + Twitter image
    if (opts.ogImage) {
      setMeta('meta[property="og:image"]', "content", opts.ogImage);
      setMeta('meta[name="twitter:image"]', "content", opts.ogImage);
      setMeta('meta[name="twitter:card"]', "content", "summary_large_image");
    }

    // Site name
    if (opts.siteName) {
      setMeta('meta[property="og:site_name"]', "content", opts.siteName);
    }

    // Favicon
    if (opts.favicon) {
      setFavicon(opts.favicon);
    }
  }, [opts.title, opts.description, opts.keywords, opts.ogImage, opts.favicon, opts.author, opts.robots, opts.siteName]);
}
