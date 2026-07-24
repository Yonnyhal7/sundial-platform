import type { ComponentPropsWithoutRef } from "react";

type SchoolAppInstallLinkProps = ComponentPropsWithoutRef<"a">;

/**
 * A native anchor is intentional here. iOS Safari associates the manifest
 * fetched during the document load with Add to Home Screen. A full navigation
 * prevents the public-site manifest from surviving a client-side transition
 * into the school App install surface.
 */
export default function SchoolAppInstallLink(
  props: SchoolAppInstallLinkProps
) {
  return <a {...props} />;
}
