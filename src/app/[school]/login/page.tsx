import LoginForm from "./login-form";

export default async function LoginPage({
  params,
}: {
  params: Promise<{ school: string }>;
}) {
  const { school } = await params;

  return <LoginForm school={school} />;
}