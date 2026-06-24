"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

export default function AuthErrorTracker() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    // 1. Check search parameters
    const errorCode = searchParams.get("error_code") || searchParams.get("error");
    const errorDesc = searchParams.get("error_description");

    // 2. Check hash parameters (Supabase places errors in hash when using redirects)
    let hashErrorCode = "";
    let hashErrorDesc = "";

    if (typeof window !== "undefined" && window.location.hash) {
      try {
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        hashErrorCode = hashParams.get("error_code") || hashParams.get("error") || "";
        hashErrorDesc = hashParams.get("error_description") || "";
      } catch (e) {
        console.error("Failed to parse URL hash for auth errors:", e);
      }
    }

    const finalErrorCode = errorCode || hashErrorCode;
    const finalErrorDesc = errorDesc || hashErrorDesc;

    if (finalErrorCode) {
      let friendlyMessage = finalErrorDesc 
        ? decodeURIComponent(finalErrorDesc).replace(/\+/g, " ") 
        : "Authentication error occurred.";
      
      if (finalErrorCode === "otp_expired" || finalErrorCode === "access_denied") {
        friendlyMessage = "The password reset or confirmation link is invalid or has expired. Please request a new one.";
      }

      toast.error(friendlyMessage, {
        duration: 8000,
        id: "auth-error-toast",
      });

      // Clear the query parameters and hash so the error doesn't trigger again on reload
      if (typeof window !== "undefined") {
        const cleanUrl = window.location.pathname;
        router.replace(cleanUrl);
      }
    }
  }, [searchParams, router]);

  return null;
}
