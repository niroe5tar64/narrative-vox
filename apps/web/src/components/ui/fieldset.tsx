import { cn } from "@/lib/utils";

interface FieldsetProps {
	legend: string;
	/** legend のクラスを上書きする場合に指定 */
	legendClassName?: string;
	children: React.ReactNode;
}

export function Fieldset({ legend, legendClassName, children }: FieldsetProps) {
	return (
		<fieldset className="rounded-md border border-slate-200 p-4">
			<legend
				className={cn(
					"px-1 text-xs font-semibold uppercase tracking-wide text-slate-600",
					legendClassName,
				)}
			>
				{legend}
			</legend>
			{children}
		</fieldset>
	);
}
