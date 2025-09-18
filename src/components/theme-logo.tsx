"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import Image from "next/image";

interface ThemeLogoProps {
  className?: string;
  alt?: string;
}

export default function ThemeLogo({ className, alt = "Acadlabs Logo" }: ThemeLogoProps) {
  const { theme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch by only rendering theme-dependent UI after mount
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    // Return a placeholder during SSR and initial client-side render
    return <div className={className} />;
  }

  const currentTheme = theme === "system" ? resolvedTheme : theme;
  const logoSrc = currentTheme === "dark" ? "/acadlabs-logo-light.svg" : "/acadlabs-logo-black.svg";
  const dims = currentTheme === "dark" ? { width: 612, height: 408 } : { width: 500, height: 500 };

  return (
    <Image
      src={logoSrc}
      alt={alt}
      width={dims.width}
      height={dims.height}
      className={className}
    />
  );
}