import React, { useEffect, useState } from "react";
import { api } from "../lib/api";

export default function AuthedImage({ path, alt, className }) {
  const [src, setSrc] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    let objectUrl = null; // created inside the effect; cleanup revokes THIS, not a stale closure over `src`
    setSrc(null);
    setError(false);
    const fetchImage = async () => {
      try {
        const r = await api.get(`/media/${path}`, { responseType: "blob" });
        if (!isMounted) return;
        objectUrl = URL.createObjectURL(r.data);
        setSrc(objectUrl);
      } catch (e) {
        console.error("Failed to load image", e);
        if (isMounted) setError(true);
      }
    };
    if (path) fetchImage();
    return () => {
      isMounted = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);

  if (!path) return null;
  if (error) {
    return (
      <div className={`flex items-center justify-center bg-[#1E293B] text-[#94A3B8] text-[11px] text-center px-2 ${className || ""}`}>
        Image unavailable
      </div>
    );
  }
  if (!src) return <div className={`bg-[#1E293B] animate-pulse ${className}`} />;
  return <img src={src} alt={alt} className={className} />;
}
