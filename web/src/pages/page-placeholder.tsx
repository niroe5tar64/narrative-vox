import { Button } from "@/components/ui/button";

type PagePlaceholderProps = {
  title: string;
  description: string;
  path: string;
};

export function PagePlaceholder({ title, description, path }: PagePlaceholderProps) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white/85 p-6 shadow-sm backdrop-blur">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">{path}</p>
      <h2 className="mt-3 text-2xl font-bold tracking-tight text-slate-900">{title}</h2>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">{description}</p>
      <div className="mt-5 flex gap-3">
        <Button>Implement in next tasks</Button>
        <Button variant="secondary">View API contract</Button>
      </div>
    </section>
  );
}
