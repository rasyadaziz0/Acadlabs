export default function SEOJsonLd() {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://acadlabs.fun";

  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Acadlabs",
    url: baseUrl,
    logo: `${baseUrl}/favicon-black.ico`,
  };

  const website = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Acadlabs",
    url: baseUrl,
  };

  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organization) }}
      />
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(website) }}
      />
    </>
  );
}
