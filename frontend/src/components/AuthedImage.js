import React, { useEffect, useState } from "react";
import { api } from "../lib/api";

export default function AuthedImage({ path, alt, className }) {
  const [src, setSrc] = useState(null);

  useEffect(() => {
    let isMounted = true;
    const fetchImage = async () => {
      try {
        const r = await api.get(`/media/${path}`, { responseType: "blob" });
        if (isMounted) {
          setSrc(URL.createObjectURL(r.data));
        }
      } catch (e) {
        console.error("Failed to load image", e);
      }
    };
    if (path) fetchImage();
    return () => {
      isMounted = false;
      if (src) URL.revokeObjectURL(src);
    };
  }, [path]);

  if (!path) return null;
  if (!src) return <div className={`bg-[#1E293B] animate-pulse ${className}`} />;
  return <img src={src} alt={alt} className={className} />;
}
