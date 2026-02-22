import { Label } from "@/components/ui/label";

interface FormFieldProps {
	label: string;
	/** true のとき必須マーク(*)、false/未指定のとき任意ラベルを表示 */
	required?: boolean;
	hint?: React.ReactNode;
	children: React.ReactNode;
}

export function FormField({ label, required, hint, children }: FormFieldProps) {
	return (
		<div>
			<Label>
				{label}
				{required ? (
					<span className="ml-0.5 text-red-500">*</span>
				) : (
					<span className="ml-1 text-xs text-slate-400">(任意)</span>
				)}
			</Label>
			{children}
			{hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
		</div>
	);
}
