"use client";

import {
  useEffect,
  useState,
} from "react";
import Link from "next/link";
import {
  Bot,
  ChevronRight,
  LoaderCircle,
  Plus,
} from "lucide-react";

type Project = {
  id: number;
  project_number: string;
  name: string;
  status: string;
  versions_count: number;
};

export function OrderAiProjects({
  orderId,
}: {
  orderId: number;
}) {
  const [projects, setProjects] =
    useState<Project[]>([]);
  const [loading, setLoading] =
    useState(true);

  useEffect(() => {
    const token =
      localStorage.getItem(
        "yokai_token"
      );

    if (!token) {
      setLoading(false);
      return;
    }

    void (async () => {
      try {
        const response = await fetch(
          `/api/orders/${orderId}/ai-projects`,
          {
            headers: {
              Authorization:
                `Bearer ${token}`,
            },
            cache: "no-store",
          }
        );

        if (response.ok) {
          setProjects(
            await response.json()
          );
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [orderId]);

  return (
    <section className="surface-card mt-5 overflow-hidden">
      <div className="flex flex-col justify-between gap-4 border-b border-white/[.06] p-5 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2 font-semibold">
            <Bot className="size-5 text-violet-300" />
            Projekty AI Studio
          </div>
          <div className="mt-1 text-xs text-white/30">
            Koncepty i wersje projektu przypisane do zamówienia.
          </div>
        </div>

        <Link
          href={`/ai-studio?order=${orderId}`}
          className="secondary-button self-start border-violet-400/15 text-violet-200 sm:self-auto"
        >
          <Plus className="size-4" />
          Nowy projekt AI
        </Link>
      </div>

      {loading ? (
        <div className="grid min-h-[110px] place-items-center">
          <LoaderCircle className="size-5 animate-spin text-white/20" />
        </div>
      ) : projects.length === 0 ? (
        <div className="grid min-h-[110px] place-items-center px-5 text-xs text-white/25">
          Brak projektów AI dla tego zamówienia.
        </div>
      ) : (
        <div className="divide-y divide-white/[.05]">
          {projects.map(project => (
            <Link
              key={project.id}
              href={`/ai-studio?project=${project.id}`}
              className="flex items-center gap-3 px-5 py-4 transition hover:bg-white/[.02]"
            >
              <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-violet-400/12 bg-violet-400/[.04]">
                <Bot className="size-4 text-violet-300" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-white/80">
                  {project.name}
                </div>
                <div className="mt-1 text-[10px] text-white/25">
                  {project.project_number}
                  {" · "}
                  {project.versions_count || 0}
                  {" wersji · "}
                  {project.status}
                </div>
              </div>

              <ChevronRight className="size-4 shrink-0 text-white/15" />
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
