import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface PersonAvatarProps {
  personId: string;
  hasPhoto: boolean;
  name: string;
  size?: "md" | "lg";
}

// The photo route is kiln-scoped and auth-headered like every other
// request in this app — a plain <img src="…"> can't send those headers,
// so the bytes are fetched through api.people.fetchPhotoBlob and turned
// into an object URL here, released on unmount/id-change. Falls back to a
// tinted initial-letter circle (the same visual language the Sidebar's
// nav icons already use) when there's no photo on file.
export function PersonAvatar({ personId, hasPhoto, name, size = "lg" }: PersonAvatarProps) {
  const [url, setUrl] = useState<string | null>(null);
  const dimension = size === "lg" ? "h-16 w-16" : "h-10 w-10";
  const textSize = size === "lg" ? "text-xl" : "text-sm";

  useEffect(() => {
    if (!hasPhoto) {
      setUrl(null);
      return;
    }
    let objectUrl: string | null = null;
    api.people.fetchPhotoBlob(personId).then((blob) => {
      if (blob) {
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      }
    });
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [personId, hasPhoto]);

  if (url) {
    return <img src={url} alt={name} className={`${dimension} shrink-0 rounded-full object-cover shadow-sm`} />;
  }

  return (
    <div className={`${dimension} flex shrink-0 items-center justify-center rounded-full bg-series-1/15 ${textSize} font-bold text-series-1`}>
      {name.trim().charAt(0).toUpperCase() || "?"}
    </div>
  );
}
