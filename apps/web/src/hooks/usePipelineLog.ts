import { useEffect, useRef, useState } from "react";
import type { LogEntry } from "@/api/client";

export type PipelineLogStatus =
	| "idle"
	| "connecting"
	| "running"
	| "done"
	| "cancelled"
	| "error";

export function usePipelineLog(jobId: string | null) {
	const [logs, setLogs] = useState<LogEntry[]>([]);
	const [status, setStatus] = useState<PipelineLogStatus>("idle");
	const wsRef = useRef<WebSocket | null>(null);

	useEffect(() => {
		if (!jobId) return;

		setLogs([]);
		setStatus("connecting");

		const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
		const url = `${protocol}//${window.location.host}/ws/pipeline/${jobId}`;
		const ws = new WebSocket(url);
		wsRef.current = ws;

		ws.onopen = () => {
			setStatus("running");
		};

		ws.onmessage = (event) => {
			try {
				const entry: LogEntry = JSON.parse(event.data as string);
				setLogs((prev) => [...prev, entry]);
				if (entry.type === "system" && entry.code !== undefined) {
					if (entry.cancelled) {
						setStatus("cancelled");
					} else if (entry.code === 0) {
						setStatus("done");
					} else {
						setStatus("error");
					}
				}
			} catch {
				// ignore malformed messages
			}
		};

		ws.onerror = () => {
			setStatus("error");
		};

		return () => {
			ws.close();
			wsRef.current = null;
		};
	}, [jobId]);

	const reset = () => {
		setLogs([]);
		setStatus("idle");
	};

	return { logs, status, reset };
}
