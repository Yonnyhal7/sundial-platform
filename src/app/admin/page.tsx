import AdminLoginForm from "./admin-login-form";

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ passwordUpdated?: string }> }) {
  return <AdminLoginForm passwordUpdated={(await searchParams).passwordUpdated === "1"} />;
}
