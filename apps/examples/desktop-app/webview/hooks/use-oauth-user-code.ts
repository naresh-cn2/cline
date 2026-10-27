import { useEffect, useState } from "react";
import { desktopClient } from "@/lib/desktop-client";

export type OAuthDeviceInfo = {
	userCode: string | null;
	verificationUrl: string | null;
};

/**
 * Device sign-in confirmation code and verification URL pushed by the sidecar
 * while a provider OAuth login is pending.
 */
export function useOAuthDeviceInfo(pending: boolean): OAuthDeviceInfo {
	const [info, setInfo] = useState<OAuthDeviceInfo>({
		userCode: null,
		verificationUrl: null,
	});

	useEffect(() => {
		if (!pending) {
			setInfo({ userCode: null, verificationUrl: null });
			return;
		}
		return desktopClient.subscribe("provider_oauth_user_code", (payload) => {
			const data = payload as { userCode?: unknown; url?: unknown } | null;
			const code = typeof data?.userCode === "string" ? data.userCode : null;
			const url = typeof data?.url === "string" ? data.url : null;
			if (code || url) {
				setInfo({ userCode: code, verificationUrl: url });
				// In web browsers, open the verification URL in a new tab directly
				if (url && typeof window !== "undefined") {
					try {
						window.open(url, "_blank");
					} catch {
						// Popups may be blocked by browser settings
					}
				}
			}
		});
	}, [pending]);

	return info;
}

export function useOAuthUserCode(pending: boolean): string | null {
	return useOAuthDeviceInfo(pending).userCode;
}
