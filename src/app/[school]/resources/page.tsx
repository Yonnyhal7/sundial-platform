import { createSupabaseServerClient } from "@/lib/supabase/server";

type Resource = {
  id: string;
  title: string;
  description: string | null;
  url: string | null;
  file_url: string | null;
  category: string | null;
};

export default async function ResourcesPage({
  params,
}: {
  params: Promise<{ school: string }>;
}) {
  const { school } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: schoolData } = await supabase
    .rpc("get_school_by_subdomain", { subdomain_input: school })
    .single<{ id: string }>();

  if (!schoolData) return null;

  const { data: resources } = await supabase
    .from("resources")
    .select("id, title, description, url, file_url, category")
    .eq("school_id", schoolData.id)
    .eq("is_active", true)
    .order("category", { ascending: true })
    .order("title", { ascending: true });

  return (
    <main className="p-8">
      <h1 className="text-4xl font-bold">Resources</h1>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        {resources?.map((resource) => (
          <article
            key={resource.id}
            className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6"
          >
            {resource.category && (
              <p className="text-sm uppercase tracking-widest text-neutral-500">
                {resource.category}
              </p>
            )}

            <h2 className="mt-2 text-2xl font-semibold">{resource.title}</h2>

            {resource.description && (
              <p className="mt-3 text-neutral-300">{resource.description}</p>
            )}

            <div className="mt-5 flex gap-3">
              {resource.url && (
                <a
                  href={resource.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black"
                >
                  Open Link
                </a>
              )}

              {resource.file_url && (
                <a
                  href={resource.file_url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-neutral-700 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:text-white dark:hover:bg-[#181818]"
                >
                  Open File
                </a>
              )}
            </div>
          </article>
        ))}

        {!resources?.length && (
          <p className="text-neutral-400">No resources available.</p>
        )}
      </div>
    </main>
  );
}
