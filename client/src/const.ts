export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Generate login URL at runtime so redirect URI reflects the current origin.
// When OAuth env is not set, returns current origin so the app does not throw (e.g. admin tab).
export const getLoginUrl = () => {
  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const appId = import.meta.env.VITE_APP_ID;
  const base =
    typeof oauthPortalUrl === "string" && oauthPortalUrl.trim()
      ? oauthPortalUrl.replace(/\/$/, "")
      : window.location.origin;

  const url = new URL(`${base}/app-auth`);
  url.searchParams.set("appId", typeof appId === "string" ? appId : "");
  url.searchParams.set("redirectUri", `${window.location.origin}/api/oauth/callback`);
  url.searchParams.set("state", btoa(`${window.location.origin}/api/oauth/callback`));
  url.searchParams.set("type", "signIn");

  return url.toString();
};
