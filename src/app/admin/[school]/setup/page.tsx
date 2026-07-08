// Local/admin path alias for localhost:3000/admin/[school]/setup.
// The canonical implementation remains in /[school]/admin/setup so production
// subdomain and admin-host rewrites keep using the same setup wizard.
export { default } from "../../../[school]/admin/setup/page";
