import { redirect } from "next/navigation";

export default async function Page({
  params,
}: {
  params: Promise<{ school: string }>;
}) {
  const { school } = await params;
  redirect(`/${school}/admin`);
}
